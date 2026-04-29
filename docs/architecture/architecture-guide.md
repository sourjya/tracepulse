# TracePulse Architecture Guide

## What Is TracePulse?

TracePulse is a **runtime feedback server** for AI coding agents. When you're using an AI assistant (like Kiro, Claude Code, Cursor, or Copilot) to write code, TracePulse watches your dev server's output, parses errors into structured data, and exposes them as tools the AI can call.

**The problem it solves:** Without TracePulse, when your dev server crashes or throws an error, the AI agent has no way to know. You'd have to manually copy-paste error logs into the chat. TracePulse automates this - the agent calls `get_errors()` and instantly knows what broke.

**In plain English:** TracePulse sits between your dev server and your AI agent. It reads the server's logs, understands what went wrong, scores how important each error is, and serves that information to the agent through the MCP protocol.

---

## How It Works (The Big Picture)

```
┌──────────────┐     stdout/stderr      ┌─────────────────────────────────┐
│              │ ────────────────────►   │         TracePulse              │
│  Your Dev    │                         │                                 │
│  Server      │  (npm run dev,          │  1. Reads log output            │
│              │   python manage.py,     │  2. Strips ANSI colors          │
│  (any lang)  │   go run main.go)       │  3. Redacts secrets             │
│              │                         │  4. Parses errors               │
└──────────────┘                         │  5. Scores importance           │
                                         │  6. Stores in ring buffer       │
                                         │                                 │
                                         └───────────────┬─────────────────┘
                                                         │
                                              MCP Protocol (JSON-RPC)
                                                         │
                                         ┌───────────────▼─────────────────┐
                                         │       AI Coding Agent           │
                                         │                                 │
                                         │  Calls: get_errors()            │
                                         │         watch_for_errors(15)    │
                                         │         get_build_errors()      │
                                         │         get_error_context(fp)   │
                                         │         ...                     │
                                         └─────────────────────────────────┘
```

---

## The Data Pipeline

Every line your dev server prints goes through this pipeline before the AI agent can see it:

> **Source:** [`src/cli.ts` - `createPipeline()`](../../src/cli.ts) | [`src/pipeline/`](../../src/pipeline/)

```
Raw Log Line
    │
    ▼
┌─────────────────┐
│ ANSI Stripping   │  Remove color codes (e.g., \033[31m)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Secret Redaction │  Replace API keys, tokens, passwords with [REDACTED]
└────────┬────────┘  (16 patterns: Bearer tokens, JWTs, AWS keys, etc.)
         │
         ▼
┌─────────────────┐
│ Hot-Reload Check │  Is this a "compiled successfully" message?
└────────┬────────┘  If yes → inject a synthetic marker event
         │
         ▼
┌─────────────────┐
│ Error Parsing    │  Try 9 parsers in order (first match wins):
│                  │  JSON → Node.js → Python → Go → Java → Rust
│                  │  → TypeScript → ESLint → Vite/webpack
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Normalization    │  Convert to RuntimeEvent:
│                  │  - Truncate message to 500 chars
│                  │  - Truncate stack to 15 frames
│                  │  - Generate fingerprint (SHA-256 hash)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Signal Scoring   │  Score 0-100 based on:
│                  │  - Unhandled exception? +40
│                  │  - Has stack trace? +20
│                  │  - User code (not node_modules)? +15
│                  │  - Error level? +10
│                  │  - First occurrence? +10
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Ring Buffer      │  Store up to 500 events
│                  │  Duplicate fingerprints update count (not add new)
│                  │  Oldest events evicted when full
└─────────────────┘
```

---

## Core Data Model

### RuntimeEvent - The Universal Error Format

> **Source:** [`src/types/events.ts`](../../src/types/events.ts)

Every error, warning, or log line becomes a `RuntimeEvent`. This is the single data shape that flows through the entire system.

```
RuntimeEvent
├── id              (UUID - unique per event)
├── timestamp       (Unix ms - when it happened)
├── source          ("server-stdout" | "server-stderr" | "build-error" | "docker-log")
├── service         ("main" | "api" | "worker" - which process)
├── level           ("error" | "warn" | "info" | "debug")
├── message         (Normalized error text, max 500 chars)
├── stack_trace?    (Stack frames, max 15)
├── fingerprint     (SHA-256 dedup key - same error = same fingerprint)
├── signal_score    (0-100 importance score)
├── signal_strength ("high" ≥50 | "medium" 20-49 | "low" <20)
├── context
│   ├── file?       (Source file path)
│   ├── line?       (Line number)
│   ├── column?     (Column number)
│   ├── framework?  ("node" | "python" | "typescript" | etc.)
│   ├── error_type? ("TypeError" | "TS2345" | etc.)
│   └── trace_id?   (Distributed trace ID)
├── raw             (Original log line, max 1000 chars)
├── first_seen      (When this fingerprint first appeared)
└── occurrence_count (How many times this fingerprint has been seen)
```

### Signal Scoring - How Important Is This Error?

> **Source:** [`src/pipeline/signal-scorer.ts`](../../src/pipeline/signal-scorer.ts) | [`src/constants/scoring.ts`](../../src/constants/scoring.ts) | [`src/scoring/infra-patterns.ts`](../../src/scoring/infra-patterns.ts)

```
Score 0 ──────────────────────────────────────────── 100
  │                    │                    │
  │    LOW (<20)       │  MEDIUM (20-49)    │  HIGH (≥50)
  │                    │                    │
  │  Deprecation       │  HTTP 4xx          │  Unhandled exception
  │  warnings          │  Caught errors     │  with stack trace in
  │  Info logs         │  without stack     │  user code
  │                    │                    │
```

Scoring is additive. Each matching condition adds points:

| Condition | Points |
|-----------|--------|
| Unhandled exception / crash | +40 |
| Stack trace present | +20 |
| File:line in user code (not node_modules) | +15 |
| HTTP 5xx | +15 |
| Error-level log | +10 |
| First occurrence of this fingerprint | +10 |
| Warning-level log | +5 |
| Seen 3+ times (noise reduction) | -5 |

---

## MCP Tools - What the Agent Can Call

> **Source:** [`src/mcp/server.ts`](../../src/mcp/server.ts) | [`src/tools/`](../../src/tools/)

TracePulse exposes tools via the Model Context Protocol. These are the tools currently **registered and wired** in the MCP server:

### Registered Tools (26 tools)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MCP Tool Handlers                            │
│                                                                     │
│  Phase 1 (Core):                                                    │
│  ┌─────────────────┐ ┌──────────────────┐ ┌────────────────────┐  │
│  │ get_errors      │ │ get_server_logs  │ │ get_runtime_status │  │
│  │ (signal sort)   │ │ (timestamp sort) │ │ (health check)     │  │
│  └─────────────────┘ └──────────────────┘ └────────────────────┘  │
│  ┌─────────────────┐                                               │
│  │ clear_errors    │                                               │
│  │ (reset buffer)  │                                               │
│  └─────────────────┘                                               │
│                                                                     │
│  Phase 2 (Watch Mode):                                              │
│  ┌───────────────────┐ ┌──────────────────┐ ┌──────────────────┐  │
│  │ watch_for_errors  │ │ get_build_errors │ │ get_error_context │  │
│  │ (block N seconds) │ │ (TS/ESLint/Vite) │ │ (deep-dive)      │  │
│  └───────────────────┘ └──────────────────┘ └──────────────────┘  │
│  ┌──────────────────┐                                              │
│  │ get_timeline     │                                              │
│  │ (chronological)  │                                              │
│  └──────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### All Tools Wired

These handlers exist as standalone functions and will be registered in the MCP server during final integration:

| Handler | Phase | Purpose |
|---------|-------|---------|
| `handleListServices` | Phase 3 | Service names, statuses, error counts |
| `handleGetCorrelatedErrors` | Phase 4 | Match browser failures with backend errors |
| `handleGetNewErrors` | Phase 5 | Only errors with unseen fingerprints |
| `handleGetErrorTrends` | Phase 5 | Cross-session frequency for a fingerprint |
| `handleCorrelateWithDiff` | Phase 5 | Link errors to recent git changes |

---

## Error Parsers - What Languages Are Supported?

> **Source:** [`src/parsers/`](../../src/parsers/) | [`src/pipeline/parser-registry.ts`](../../src/pipeline/parser-registry.ts)

TracePulse has 9 parsers that run in priority order. The first parser that matches a log line wins.

```
Log Line Arrives
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│                    Parser Registry                            │
│                                                              │
│  Priority 1: JSON Structured Logs                            │
│              (pino, structlog, logback - any JSON with        │
│               "level" and "message" fields)                   │
│                                                              │
│  Priority 2: Node.js (TypeError, ReferenceError + V8 stack)  │
│  Priority 3: Python (Traceback with File:line extraction)    │
│  Priority 4: Go     (panic + goroutine stack traces)         │
│  Priority 5: Java   (Exception + at frames + Caused by)      │
│  Priority 6: Rust   (panic + RUST_BACKTRACE output)          │
│                                                              │
│  Priority 7: TypeScript Compiler (tsc errors: TS####)        │
│  Priority 8: ESLint (indented line:col error rule-name)      │
│  Priority 9: Vite/webpack ([vite] errors, ERROR in, etc.)    │
│                                                              │
│  No match: stored as raw info-level event                    │
└──────────────────────────────────────────────────────────────┘
```

---

## Storage - The Ring Buffer

> **Source:** [`src/store/ring-buffer.ts`](../../src/store/ring-buffer.ts) | [`src/types/collectors.ts`](../../src/types/collectors.ts)

All events live in an in-memory ring buffer. No database, no files (except optional fingerprint persistence).

```
Ring Buffer (500 slots)
┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
│ 0 │ 1 │ 2 │ 3 │ 4 │...│496│497│498│499│
└───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘
  ▲                                   ▲
  │                                   │
  write pointer wraps around          oldest event gets
  when buffer is full                 overwritten (FIFO)

Features:
- O(1) push (modulo arithmetic)
- Fingerprint dedup: same error updates count, doesn't add new slot
- Subscribe/unsubscribe: watch_for_errors gets real-time events
- Query with filters: since, source, level, limit
```

---

## Multi-Process Architecture (Phase 3)

> **Source:** [`src/collectors/multi-process-collector.ts`](../../src/collectors/multi-process-collector.ts) | [`src/services/service-registry.ts`](../../src/services/service-registry.ts)

TracePulse can monitor multiple services simultaneously:

```
┌─────────────────────────────────────────────────────────────┐
│                    TracePulse Server                         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 Service Registry                      │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │ api      │  │ worker   │  │ frontend         │   │  │
│  │  │ running  │  │ running  │  │ crashed (exit 1) │   │  │
│  │  │ 3 errors │  │ 0 errors │  │ 1 error          │   │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│  ┌───────────────────────▼──────────────────────────────┐  │
│  │              Shared Ring Buffer (500)                  │  │
│  │  Every event tagged with service name                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Collectors:                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │ Process      │  │ Process      │  │ Docker Log     │   │
│  │ Spawner      │  │ Spawner      │  │ Collector      │   │
│  │ (api)        │  │ (worker)     │  │ (compose svcs) │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬─────────┘   │
│         │                  │                  │             │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
     child process      child process     Docker Engine API
     stdout/stderr      stdout/stderr     /var/run/docker.sock
```

---

## Frontend-Backend Correlation (Phase 4)

> **Source:** [`src/correlation/fe-be-correlation.ts`](../../src/correlation/fe-be-correlation.ts) | [`src/correlation/frontend-error-buffer.ts`](../../src/correlation/frontend-error-buffer.ts) | [`src/correlation/trace-id-extractor.ts`](../../src/correlation/trace-id-extractor.ts)

TracePulse can match browser HTTP failures with backend stack traces:

```
Browser (Chrome)                    Dev Server (Node/Python/etc.)
     │                                      │
     │  GET /api/users → 500                │  TypeError: Cannot read 'id'
     │                                      │    at getUser (users.ts:42)
     │                                      │
     ▼                                      ▼
┌──────────────────┐              ┌──────────────────┐
│ Frontend Error   │              │ Backend Event    │
│ Buffer (200 max) │              │ Buffer (500 max) │
│                  │              │                  │
│ url: /api/users  │              │ message: TypeError│
│ status: 500      │              │ file: users.ts:42│
│ traceId: abc123  │              │ trace_id: abc123 │
└────────┬─────────┘              └────────┬─────────┘
         │                                  │
         └──────────┬───────────────────────┘
                    │
            ┌───────▼────────┐
            │  Correlation   │
            │  Engine        │
            │                │
            │  Match by:     │
            │  1. Trace ID   │  → confidence 1.0
            │  2. URL + time │  → confidence 0.7-0.9
            └───────┬────────┘
                    │
                    ▼
            CorrelatedError {
              frontend_error: { url, status, traceId }
              backend_error:  { message, file, line }
              confidence: 1.0
              method: "trace-id"
            }
```

---

## Security Model

> **Source:** [`src/pipeline/secret-redactor.ts`](../../src/pipeline/secret-redactor.ts) | [`src/constants/redaction.ts`](../../src/constants/redaction.ts)

TracePulse handles potentially sensitive log output. Here's how it stays safe:

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layers                           │
│                                                             │
│  1. SECRET REDACTION (runs on ALL input before storage)     │
│     16 patterns: API keys, Bearer tokens, JWTs,            │
│     connection strings, PEM keys, GitHub/GitLab/Slack       │
│     tokens, AWS keys, passwords in URLs                     │
│                                                             │
│  2. NO FILE WRITES (except optional fingerprint file)       │
│     All state is in-memory. Ring buffer is ephemeral.       │
│                                                             │
│  3. LOCALHOST ONLY for HTTP endpoints                       │
│     HTTP transport: 127.0.0.1:9800                          │
│     Log collector:  127.0.0.1:9801                          │
│                                                             │
│  4. FINGERPRINT PERSISTENCE has NO raw messages             │
│     Only stores: fingerprint hash, first_seen, last_seen,   │
│     total_count. No error text, no stack traces.            │
│                                                             │
│  5. STDOUT RESERVED for MCP JSON-RPC                        │
│     All diagnostic output goes to stderr.                   │
│     No accidental data leakage through protocol channel.    │
│                                                             │
│  6. TRUNCATION LIMITS                                       │
│     Messages: 500 chars, Stack traces: 15 frames,           │
│     Raw lines: 1000 chars, Parse input: 10,000 chars        │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration

> **Source:** [`src/config/config-schema.ts`](../../src/config/config-schema.ts) | [`src/config/config-loader.ts`](../../src/config/config-loader.ts) | [`src/cli.ts`](../../src/cli.ts)

### Zero-Config (Single Process)

```bash
npx tracepulse start "npm run dev"
```

### Config File (Multi-Process)

```json
// tracepulse.config.json
{
  "services": [
    { "name": "api", "command": "npm run dev:api" },
    { "name": "worker", "command": "npm run dev:worker" }
  ],
  "transport": {
    "http": true,
    "http_port": 9800
  },
  "persist": true,
  "correlation_window_ms": 2000
}
```

### CLI Flags

```bash
tracepulse start "npm run dev"                    # single process
tracepulse start --service api="npm run api"      # multi-process
tracepulse start --config tracepulse.config.json  # config file
tracepulse attach --log-file ./server.log         # tail existing log
tracepulse compose --file docker-compose.yml      # Docker Compose
```

---

## File Structure

```
src/
├── cli.ts                          # CLI entry point, argument parsing
├── index.ts                        # Version export
├── mcp/
│   └── server.ts                   # MCP server with 8 registered tools
├── pipeline/
│   ├── secret-redactor.ts          # 16-pattern secret redaction
│   ├── parser-registry.ts          # Ordered parser dispatch (9 parsers)
│   ├── event-normalizer.ts         # Raw → RuntimeEvent conversion
│   ├── fingerprinter.ts            # SHA-256 dedup key generation
│   └── signal-scorer.ts            # 0-100 additive scoring
├── parsers/
│   ├── node-parser.ts              # Node.js/V8 errors
│   ├── python-parser.ts            # Python tracebacks
│   ├── go-parser.ts                # Go panics
│   ├── java-parser.ts              # Java exceptions
│   ├── rust-parser.ts              # Rust panics
│   ├── json-log-parser.ts          # Structured JSON logs
│   └── build/
│       ├── typescript-parser.ts    # tsc errors (TS####)
│       ├── eslint-parser.ts        # ESLint output
│       └── vite-webpack-parser.ts  # Vite/webpack build errors
├── store/
│   └── ring-buffer.ts              # 500-event circular buffer with subscribe
├── collectors/
│   ├── process-spawner.ts          # Single child process (Phase 1)
│   ├── multi-process-collector.ts  # Multiple child processes (Phase 3)
│   ├── log-file-tailer.ts          # Tail existing log files
│   └── docker-log-collector.ts     # Docker Engine API log parsing
├── watch/
│   ├── watch-controller.ts         # Blocking watch_for_errors logic
│   ├── hot-reload-detector.ts      # Pattern matching for reload events
│   └── hot-reload-patterns.ts      # 8 patterns (Vite, webpack, etc.)
├── query/
│   └── timeline-query.ts           # Time-range queries on the buffer
├── tools/
│   ├── watch-for-errors.ts         # MCP tool handler
│   ├── get-build-errors.ts         # MCP tool handler
│   ├── get-error-context.ts        # MCP tool handler
│   ├── get-timeline.ts             # MCP tool handler
│   ├── list-services.ts            # MCP tool handler 
│   ├── get-correlated-errors.ts    # MCP tool handler 
│   ├── get-new-errors.ts           # MCP tool handler 
│   ├── get-error-trends.ts         # MCP tool handler 
│   └── correlate-with-diff.ts      # MCP tool handler 
├── services/
│   └── service-registry.ts         # Multi-service lifecycle tracking
├── config/
│   ├── config-schema.ts            # Config validation
│   └── config-loader.ts            # File + CLI config merging
├── correlation/
│   ├── correlation-engine.ts       # Cross-service temporal grouping
│   ├── fe-be-correlation.ts        # Frontend-backend matching
│   ├── frontend-error-buffer.ts    # 200-event buffer for browser errors
│   ├── trace-id-extractor.ts       # W3C traceparent parsing
│   ├── git-diff-correlator.ts      # Link errors to git changes
│   ├── types.ts                    # FrontendError, CorrelatedError
│   └── sources/
│       └── log-collector.ts        # HTTP server for browser error ingestion
├── persistence/
│   ├── fingerprint-store.ts        # Load/save fingerprints to JSON
│   └── fingerprint-history.ts      # In-memory fingerprint tracking
├── scoring/
│   └── severity-classifier.ts      # crash/error/warning/info classification
├── notifications/
│   └── notification-dispatcher.ts  # Future push notification support
├── transport/
│   └── http-transport.ts           # Streamable HTTP on localhost:9800
├── constants/                      # All magic numbers in one place
│   ├── events.ts                   # Event sources, log levels, signal tiers
│   ├── limits.ts                   # Buffer sizes, truncation limits
│   ├── scoring.ts                  # Signal score factors
│   ├── redaction.ts                # Secret patterns
│   ├── watch.ts                    # Watch mode durations and limits
│   ├── services.ts                 # Service statuses, ports
│   └── correlation.ts             # Correlation thresholds, confidence scores
└── types/
    ├── events.ts                   # RuntimeEvent, EventFilters
    ├── parsers.ts                  # ErrorParser, ParsedError
    └── collectors.ts               # EventBuffer, Collector interfaces
```

---

## Test Coverage

566 tests across 59 files. Every module has unit tests. Integration tests verify cross-module behavior.

```
tests/
├── unit/           (module-level tests, no I/O)
│   ├── parsers/    (6 runtime + 3 build parsers)
│   ├── pipeline/   (redactor, normalizer, fingerprinter, scorer, registry)
│   ├── store/      (ring buffer + subscription)
│   ├── watch/      (patterns, detector, controller)
│   ├── query/      (timeline queries)
│   ├── collectors/ (process spawner, multi-process, Docker)
│   ├── config/     (schema validation, loader)
│   ├── services/   (service registry)
│   ├── correlation/(cross-service, FE-BE, trace IDs, git diff)
│   ├── scoring/    (severity classifier)
│   ├── persistence/(fingerprint store + history)
│   ├── notifications/(dispatcher)
│   ├── transport/  (HTTP transport)
│   ├── tools/      (list_services, service filter, proactive tools)
│   ├── mcp/        (server tool handlers)
│   └── cli/        (argument parsing)
│
└── integration/    (cross-module tests)
    ├── pipeline-flow.test.ts
    ├── secret-redaction-e2e.test.ts
    ├── mcp-tools.test.ts
    ├── correlation-integration.test.ts
    ├── multi-process-flow.test.ts
    ├── backward-compat.test.ts
    ├── security-phase3.test.ts
    ├── persistence-lifecycle.test.ts
    └── tools/
        ├── watch-for-errors.test.ts
        ├── get-build-errors.test.ts
        ├── get-error-context.test.ts
        ├── get-timeline.test.ts
        └── get-correlated-errors.test.ts
```

---

## What's Left (M6: Stable Release)

The remaining milestone is a release milestone - no new features:

- All 26 tool handlers wired into MCP server
- Full test coverage audit (target ≥80%)
- Performance benchmarks
- npm package publish (`npx tracepulse`)
- Complete API reference documentation
- Tier 3 security review (full codebase)
- Maintainability review
- GitHub release with changelog
