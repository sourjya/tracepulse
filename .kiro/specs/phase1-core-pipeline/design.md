# Phase 1: Core Pipeline — Design

## Architecture Overview

TracePulse is a stdio-based MCP server that sits between a dev server process and an AI coding agent. The pipeline is strictly linear:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          TracePulse MCP Server                           │
│                                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐                │
│  │  Collectors  │───▶│   Pipeline   │───▶│  Event Store │                │
│  │             │    │              │    │              │                │
│  │ ProcessSpawn│    │ 1. Redactor  │    │ Ring Buffer  │◀── MCP Tools   │
│  │ LogFileTail │    │ 2. Parsers   │    │ (500 max)    │    get_errors  │
│  └─────────────┘    │ 3. Normalizer│    │ Fingerprint  │    get_logs    │
│                     │ 4. Scorer    │    │ Dedup Map    │    get_status  │
│                     └──────────────┘    └──────────────┘    clear       │
│                                                                          │
│  ┌─────────────┐    ┌──────────────┐                                    │
│  │     CLI     │    │  MCP Server  │◀──▶ Agent (stdio JSON-RPC)         │
│  │ start|attach│    │  @mcp/sdk    │                                    │
│  └─────────────┘    └──────────────┘                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

**Data flow:** Raw line → Secret Redaction → Error Parsing → Event Normalization → Signal Scoring → Fingerprint/Dedup → Ring Buffer → MCP Tool query.

**Key constraint:** stdout is reserved for MCP JSON-RPC. All diagnostic output goes to stderr.

---

## Data Model

### RuntimeEvent

The core data structure. Every log line or error becomes a RuntimeEvent.

```typescript
/**
 * Event source — where the log line originated.
 * Phase 1 supports server-stdout and server-stderr from process spawning
 * and log file tailing. build-error and docker-log are reserved for Phase 2+.
 */
type EventSource = 'server-stdout' | 'server-stderr' | 'build-error' | 'docker-log';

/** Log severity level, ordered from most to least severe. */
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Signal strength tier derived from signal_score.
 * Agents use this for progressive disclosure — high-signal errors get
 * full attention, low-signal events are background noise.
 * See Decision 7 in feature-architecture-analysis.md.
 */
type SignalStrength = 'high' | 'medium' | 'low';

/**
 * Structured context extracted from parsed errors.
 * All fields are optional — parsers populate what they can extract.
 */
interface EventContext {
  /** Source file path where the error originated. */
  readonly file?: string;
  /** Line number in the source file. */
  readonly line?: number;
  /** Column number in the source file. */
  readonly column?: number;
  /** Framework or runtime that produced the error (e.g., 'node', 'python', 'go'). */
  readonly framework?: string;
  /** Error class name (e.g., 'TypeError', 'ImportError'). */
  readonly error_type?: string;
  /** Distributed trace ID extracted from headers or structured logs. */
  readonly trace_id?: string;
}

/**
 * The core event schema. Every log line or error is normalized into this shape.
 * Agents query RuntimeEvents via MCP tools. The schema is designed for
 * token efficiency — agents get structured data, not raw text to parse.
 *
 * Immutable after creation except for occurrence_count and timestamp on dedup.
 */
interface RuntimeEvent {
  /** UUIDv4 — unique per first occurrence. Deduped events share the original ID. */
  readonly id: string;
  /** Unix milliseconds — updated to latest occurrence on dedup. */
  readonly timestamp: number;
  /** Where the log line came from. */
  readonly source: EventSource;
  /** Which process/service produced this event. Default: 'main'. */
  readonly service: string;
  /** Log severity. */
  readonly level: LogLevel;
  /** Normalized error message, truncated to 500 chars. */
  readonly message: string;
  /** Stack trace, top 15 frames. Undefined for non-error events. */
  readonly stack_trace?: string;
  /** Stable dedup key: hash of source + normalized message + file:line. */
  readonly fingerprint: string;
  /** Additive signal score 0-100 per Decision 7. */
  readonly signal_score: number;
  /** Tier derived from signal_score: high (>=50), medium (20-49), low (<20). */
  readonly signal_strength: SignalStrength;
  /** Structured context extracted by parsers. */
  readonly context: EventContext;
  /** Original raw log line(s), truncated to 1000 chars. */
  readonly raw: string;
  /** Unix ms — when this fingerprint was first seen. Never changes on dedup. */
  readonly first_seen: number;
  /** How many times this fingerprint has been seen. Increments on dedup. */
  readonly occurrence_count: number;
}
```

### ParsedError (internal — parser output)

```typescript
/**
 * Intermediate representation returned by error parsers.
 * The normalizer converts this into a RuntimeEvent.
 * Parsers only extract what they can — all fields except message are optional.
 */
interface ParsedError {
  /** The error message text. */
  readonly message: string;
  /** Full stack trace string. */
  readonly stack_trace?: string;
  /** Log level detected by the parser. */
  readonly level: LogLevel;
  /** Structured context extracted from the error. */
  readonly context: Partial<EventContext>;
  /** Scoring hints for the signal scorer. */
  readonly scoring_hints: {
    readonly is_unhandled_exception?: boolean;
    readonly has_stack_trace?: boolean;
    readonly is_user_code?: boolean;
    readonly http_status?: number;
    readonly is_first_occurrence?: boolean;
  };
}
```

### ErrorParser (interface — pluggable parsers)

```typescript
/**
 * Interface for framework-specific error parsers.
 * Each parser attempts to match and extract structured data from raw log lines.
 * Parsers are tried in registration order; the first match wins.
 *
 * Implementations: NodeErrorParser, PythonErrorParser, GoErrorParser,
 * JavaErrorParser, RustErrorParser, JsonLogParser.
 */
interface ErrorParser {
  /** Human-readable name for logging (e.g., 'node', 'python'). */
  readonly name: string;

  /**
   * Test whether this parser can handle the given line(s).
   * Must be fast — called for every line against every parser until one matches.
   * Should not throw.
   */
  canParse(line: string): boolean;

  /**
   * Parse the line(s) into a ParsedError.
   * Called only if canParse returned true.
   * May consume multiple lines for multi-line stack traces.
   * Returns null if parsing fails despite canParse returning true.
   */
  parse(line: string, getNextLine?: () => string | null): ParsedError | null;
}
```

---

## Component Design

### 1. CLI (`src/cli.ts`)

Parses command-line arguments and orchestrates startup. No argument parsing library — the CLI surface is small enough for manual parsing.

```
npx tracepulse start "npm run dev"        → ProcessSpawner + MCP Server
npx tracepulse attach --log-file ./log    → LogFileTailer + MCP Server
npx tracepulse --version                  → print version to stderr, exit
npx tracepulse --help                     → print usage to stderr, exit
```

The CLI creates the appropriate collector, wires it to the pipeline, and starts the MCP server on stdio.

### 2. Process Spawner (`src/collectors/process-spawner.ts`)

Spawns the dev server command via `node:child_process.spawn` with `shell: true`. Captures stdout and stderr as separate streams. Emits raw lines to the pipeline with the correct `source` tag.

**Responsibilities:**
- Spawn child process with inherited env
- Split stdout/stderr into lines (handle partial lines at stream boundaries)
- Emit `{ source, line }` tuples to the pipeline
- Detect child exit (crash or clean shutdown)
- Forward SIGINT/SIGTERM to child on shutdown
- Inject synthetic events for process lifecycle (started, exited, crashed)

### 3. Log File Tailer (`src/collectors/log-file-tailer.ts`)

Tails a log file using `node:fs.watch` + `node:fs.createReadStream`. Reads from the current end of the file, emitting new lines as they're appended.

**Responsibilities:**
- Wait for file creation if it doesn't exist (up to 30s timeout)
- Detect file truncation (rotation) and reset read position
- Emit lines to the pipeline with configurable `source` tag
- Handle binary/corrupt data gracefully (skip non-UTF-8 lines)

### 4. Collector Interface (`src/collectors/types.ts`)

```typescript
/**
 * Common interface for all log collectors (process spawner, log file tailer).
 * The pipeline consumes lines from collectors without knowing the source type.
 */
interface Collector {
  /** Start collecting. Calls onLine for each new line. */
  start(onLine: (source: EventSource, line: string) => void): Promise<void>;
  /** Stop collecting. Clean up resources. */
  stop(): Promise<void>;
  /** Whether the collector is actively receiving data. */
  isConnected(): boolean;
}
```

### 5. Secret Redactor (`src/pipeline/secret-redactor.ts`)

Runs regex-based pattern matching on every raw line **before** any parsing or storage. This is the first stage of the pipeline — nothing enters the system unredacted.

**Patterns (built-in):**
- API key prefixes: `sk-`, `sk_live_`, `sk_test_`, `AKIA`, `ghp_`, `gho_`, `glpat-`, `xoxb-`, `xoxp-`
- Bearer tokens: `Bearer [A-Za-z0-9\-._~+/]+=*`
- Basic auth: `Basic [A-Za-z0-9+/]+=*`
- Key-value secrets: `(password|secret|token|api_key|apikey|access_key|private_key)\s*[=:]\s*\S+`
- Connection strings: `://[^:]+:[^@]+@` (credentials in URLs)
- PEM blocks: `-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----`
- AWS access keys: `AKIA[0-9A-Z]{16}`
- JWT tokens: `eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+`

All matches are replaced with `[REDACTED]`.

### 6. Error Parser Registry (`src/pipeline/parser-registry.ts`)

Maintains an ordered list of `ErrorParser` implementations. For each raw line, tries parsers in order until one matches. If none match, returns `null` (the normalizer creates a default info event).

**Parser order (most specific first):**
1. `JsonLogParser` — if the line is valid JSON
2. `NodeErrorParser` — Node.js stack traces
3. `PythonErrorParser` — Python tracebacks
4. `GoErrorParser` — Go panics
5. `JavaErrorParser` — Java exceptions
6. `RustErrorParser` — Rust panics

**Multi-line handling:** Some parsers (Python tracebacks, Java stack traces) need multiple lines. The registry provides a `getNextLine` callback that reads ahead from the collector's line buffer.

### 7. Framework Parsers (`src/parsers/`)

Each parser is a separate module implementing the `ErrorParser` interface:

| Parser | File | Detects |
|---|---|---|
| Node.js | `src/parsers/node-parser.ts` | `TypeError:`, `ReferenceError:`, `Error:`, `at Object.<anonymous>` patterns |
| Python | `src/parsers/python-parser.ts` | `Traceback (most recent call last):` |
| Go | `src/parsers/go-parser.ts` | `goroutine N [running]:`, `panic:`, `runtime error:` |
| Java | `src/parsers/java-parser.ts` | `Exception in thread`, `at com.`, `Caused by:` |
| Rust | `src/parsers/rust-parser.ts` | `thread 'main' panicked at`, `RUST_BACKTRACE` |
| JSON | `src/parsers/json-log-parser.ts` | Valid JSON with `level`/`severity` + `msg`/`message` fields |

### 8. Event Normalizer (`src/pipeline/event-normalizer.ts`)

Converts a `ParsedError` (or raw line if no parser matched) into a `RuntimeEvent`. Handles:
- UUID generation (`node:crypto.randomUUID`)
- Timestamp assignment (`Date.now()`)
- Message truncation (500 chars)
- Stack trace frame limiting (15 frames)
- Raw line truncation (1000 chars)
- Default field population (service: 'main', occurrence_count: 1)

### 9. Signal Scorer (`src/pipeline/signal-scorer.ts`)

Computes `signal_score` (0-100) and derives `signal_strength` from the `ParsedError` scoring hints and the event's properties.

**Scoring factors (additive, per Decision 7):**

| Factor | Points | Condition |
|---|---|---|
| Unhandled exception / crash | +40 | `scoring_hints.is_unhandled_exception` |
| Stack trace present | +20 | `scoring_hints.has_stack_trace` |
| File:line in user code | +15 | `scoring_hints.is_user_code` |
| HTTP 5xx status | +15 | `scoring_hints.http_status >= 500` |
| HTTP 4xx status | +10 | `scoring_hints.http_status >= 400 && < 500` |
| Error-level log | +10 | `level === 'error'` |
| Warning-level log | +5 | `level === 'warn'` |
| First occurrence | +10 | `scoring_hints.is_first_occurrence` |
| Recurrence (3+ times) | -5 | `occurrence_count >= 3` |

Score is clamped to `[0, 100]`. Strength tiers: `high` (≥50), `medium` (20-49), `low` (<20).

### 10. Fingerprinter (`src/pipeline/fingerprinter.ts`)

Generates a stable dedup key from event properties. Uses `node:crypto.createHash('sha256')` on a normalized input string.

**Input to hash:**
```
${source}|${normalizedMessage}|${context.file ?? ''}:${context.line ?? ''}
```

**Message normalization for fingerprinting:**
- Strip timestamps (ISO 8601, Unix timestamps)
- Strip PIDs, process IDs, thread IDs
- Strip memory addresses (`0x[0-9a-f]+`)
- Strip UUIDs
- Collapse whitespace

### 11. Ring Buffer (`src/store/ring-buffer.ts`)

Fixed-size circular buffer backed by a pre-allocated array. Maintains a separate `Map<string, number>` for fingerprint → buffer index lookup (for dedup).

```typescript
/**
 * Bounded circular buffer for RuntimeEvents.
 * FIFO eviction — oldest event is dropped when buffer is full.
 * Maintains a fingerprint index for O(1) dedup lookups.
 */
interface EventBuffer {
  /** Add an event. If fingerprint exists, update occurrence_count instead. */
  push(event: RuntimeEvent): void;
  /** Query events matching filters. Returns newest first. */
  query(filters: EventFilters): RuntimeEvent[];
  /** Count of events matching filters. */
  count(filters?: EventFilters): number;
  /** Remove all events. Returns count of removed events. */
  clear(): number;
  /** Current number of events in the buffer. */
  readonly size: number;
}

interface EventFilters {
  readonly since?: number;       // Unix ms — only events after this timestamp
  readonly source?: EventSource; // Filter by event source
  readonly level?: LogLevel;     // Minimum level filter
  readonly limit?: number;       // Max results
}
```

### 12. MCP Server (`src/mcp/server.ts`)

Registers 4 MCP tools with `@modelcontextprotocol/sdk` and connects them to the EventBuffer.

**Tool Contracts:**

#### get_errors

```json
{
  "name": "get_errors",
  "description": "Get recent error and warning events from the dev server. Returns structured RuntimeEvents sorted by signal score (highest first). Use this to see what broke after a code change.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "since": {
        "type": "number",
        "description": "Unix ms timestamp. Only return errors after this time."
      },
      "source": {
        "type": "string",
        "enum": ["server-stdout", "server-stderr", "build-error", "docker-log"],
        "description": "Filter by event source."
      },
      "limit": {
        "type": "number",
        "description": "Max results to return. Default: 20."
      }
    }
  }
}
```

**Example response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "[{\"id\":\"a1b2c3d4-...\",\"timestamp\":1714200000000,\"source\":\"server-stderr\",\"service\":\"main\",\"level\":\"error\",\"message\":\"TypeError: Cannot read properties of undefined (reading 'token')\",\"stack_trace\":\"    at AuthService.validate (/app/src/auth.ts:42:15)\\n    at Router.handle (/app/src/router.ts:18:22)\",\"fingerprint\":\"e5f6a7b8...\",\"signal_score\":85,\"signal_strength\":\"high\",\"context\":{\"file\":\"/app/src/auth.ts\",\"line\":42,\"column\":15,\"framework\":\"node\",\"error_type\":\"TypeError\"},\"raw\":\"TypeError: Cannot read properties of undefined (reading 'token')\\n    at AuthService.validate ...\",\"first_seen\":1714200000000,\"occurrence_count\":1}]"
    }
  ]
}
```

#### get_server_logs

```json
{
  "name": "get_server_logs",
  "description": "Get recent log events from the dev server at any severity level. Returns all events (errors, warnings, info, debug) sorted by timestamp (newest first). Use this to see the full server output.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "level": {
        "type": "string",
        "enum": ["error", "warn", "info", "debug"],
        "description": "Minimum log level to return. Default: all levels."
      },
      "since": {
        "type": "number",
        "description": "Unix ms timestamp. Only return logs after this time."
      },
      "limit": {
        "type": "number",
        "description": "Max results to return. Default: 50."
      }
    }
  }
}
```

#### get_runtime_status

```json
{
  "name": "get_runtime_status",
  "description": "Quick health check for the dev server. Returns connection status, error count, and last error time. Cheapest tool call (~100 tokens) — use this first before drilling into errors.",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**Example response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"connected\":true,\"error_count\":3,\"last_error_time\":1714200000000}"
    }
  ]
}
```

#### clear_errors

```json
{
  "name": "clear_errors",
  "description": "Clear all events from the buffer. Use this after fixing a bug to start with a clean slate for the next verification cycle.",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**Example response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"cleared_count\":42}"
    }
  ]
}
```

---

## Source Directory Structure

```
src/
├── cli.ts                          # CLI entry point — argument parsing, orchestration
├── index.ts                        # Package entry point — version export
├── constants/
│   ├── events.ts                   # EventSource, LogLevel, SignalStrength enums/unions
│   ├── limits.ts                   # Ring buffer size, message length, stack frame limits
│   ├── scoring.ts                  # Signal scoring factors (points per condition)
│   └── redaction.ts                # Secret redaction patterns
├── types/
│   ├── events.ts                   # RuntimeEvent, EventContext interfaces
│   ├── parsers.ts                  # ParsedError, ErrorParser, ScoringHints interfaces
│   └── collectors.ts               # Collector interface, EventFilters
├── collectors/
│   ├── process-spawner.ts          # Child process spawning and stdout/stderr capture
│   └── log-file-tailer.ts          # Log file tailing with rotation detection
├── parsers/
│   ├── node-parser.ts              # Node.js error/stack trace parser
│   ├── python-parser.ts            # Python traceback parser
│   ├── go-parser.ts                # Go panic parser
│   ├── java-parser.ts              # Java exception parser
│   ├── rust-parser.ts              # Rust panic parser
│   └── json-log-parser.ts          # JSON structured log parser
├── pipeline/
│   ├── secret-redactor.ts          # Secret pattern matching and replacement
│   ├── parser-registry.ts          # Ordered parser dispatch
│   ├── event-normalizer.ts         # ParsedError → RuntimeEvent conversion
│   ├── signal-scorer.ts            # Additive signal scoring (0-100)
│   └── fingerprinter.ts            # Stable hash generation for dedup
├── store/
│   └── ring-buffer.ts              # Bounded circular buffer with fingerprint index
└── mcp/
    └── server.ts                   # MCP tool registration and handler wiring
```

```
tests/
├── unit/
│   ├── constants/                  # Constant value validation tests
│   ├── parsers/
│   │   ├── node-parser.test.ts
│   │   ├── python-parser.test.ts
│   │   ├── go-parser.test.ts
│   │   ├── java-parser.test.ts
│   │   ├── rust-parser.test.ts
│   │   └── json-log-parser.test.ts
│   ├── pipeline/
│   │   ├── secret-redactor.test.ts
│   │   ├── parser-registry.test.ts
│   │   ├── event-normalizer.test.ts
│   │   ├── signal-scorer.test.ts
│   │   └── fingerprinter.test.ts
│   ├── store/
│   │   └── ring-buffer.test.ts
│   ├── collectors/
│   │   ├── process-spawner.test.ts
│   │   └── log-file-tailer.test.ts
│   └── mcp/
│       └── server.test.ts
├── integration/
│   ├── pipeline-flow.test.ts       # End-to-end: raw line → RuntimeEvent in buffer
│   └── mcp-tools.test.ts           # MCP tool calls against a running server
└── conftest.ts                     # Shared test fixtures and helpers
```

---

## Observability Design

### Structured Logging (stderr)

All diagnostic output uses structured JSON to stderr. Format:

```json
{
  "ts": "2026-04-27T12:00:00.000Z",
  "level": "info",
  "component": "process-spawner",
  "msg": "Child process started",
  "pid": 12345,
  "command": "npm run dev"
}
```

### What Gets Logged

| Component | Events Logged |
|---|---|
| CLI | Startup args, version, mode (start/attach) |
| ProcessSpawner | Process started (PID, command), process exited (code, signal), spawn failure |
| LogFileTailer | File opened, file not found (waiting), file truncated (rotation), tail error |
| SecretRedactor | Redaction count per line (not the secrets themselves) |
| ParserRegistry | Parser matched (parser name, line preview), no parser matched |
| SignalScorer | Score breakdown for high-signal events only (score ≥ 50) |
| RingBuffer | Event added, event deduplicated (fingerprint, new count), buffer full (eviction), buffer cleared |
| MCP Server | Tool called (name, params), tool response (result count, duration ms) |
| Shutdown | Signal received, child signal forwarded, child exited, cleanup complete |

### What Does NOT Get Logged

- Raw log content (may contain secrets even after redaction — defense in depth)
- Full RuntimeEvent payloads (available via MCP tools)
- Environment variables
- File system paths from the user's project (except in error context)

---

## Error Handling Strategy

| Component | Failure Mode | Handling |
|---|---|---|
| ProcessSpawner | Command not found | Log error to stderr, exit with code 1 |
| ProcessSpawner | Child crashes | Inject synthetic error event, keep MCP server running |
| LogFileTailer | File not found | Wait up to 30s, then exit with error |
| LogFileTailer | Read error | Log to stderr, skip line, continue tailing |
| SecretRedactor | Regex timeout (pathological input) | Apply 10ms timeout per pattern, skip pattern on timeout |
| Parser | Parser throws | Catch, log to stderr, treat line as unparsed info event |
| RingBuffer | Concurrent access | Single-threaded (Node.js event loop) — no locking needed |
| MCP Server | Invalid tool params | Return MCP error response with descriptive message |
| MCP Server | stdio pipe broken | Detect via error event, initiate graceful shutdown |
| Pipeline | ANSI escape codes in output | Strip before parsing via regex replace _(Pitfall 4.4)_ |
| Pipeline | Line exceeds 10KB | Truncate to 10KB before parsing, log warning _(Pitfalls 1.8, 6.2)_ |
| CLI | Double SIGINT/SIGTERM | Ignore subsequent signals while shutdown in progress _(Pitfall 5.2)_ |
| CLI | Uncaught exception / unhandled rejection | Log to stderr, attempt graceful shutdown, exit code 1 _(Pitfall 3.2)_ |
| CLI | stdout EPIPE (client disconnected) | Detect via error listener on process.stdout, initiate shutdown _(Pitfall 3.3)_ |
| ProcessSpawner | Python output block-buffered | Set `PYTHONUNBUFFERED=1` in child env _(Pitfall 1.1)_ |

---

## Pipeline Hardening

Based on the [Collector Pitfalls & Hardening Guide](../../../docs/references/collector-pitfalls-hardening.md), the following defensive measures are built into the pipeline:

### P0 — Implemented in Phase 1

1. **ANSI Stripping**: Strip ANSI escape codes (`/\x1b\[[0-9;]*m/g`) from every line before secret redaction and parsing. Many dev servers output colored text that breaks regex parsers. _(Pitfall 4.4)_
2. **Line Length Guard**: Lines exceeding `MAX_PARSE_INPUT_LENGTH` (10KB) are truncated before entering the parser pipeline. Prevents ReDoS from pathological input. _(Pitfalls 1.8, 6.2)_
3. **Python Unbuffering**: Process spawner sets `PYTHONUNBUFFERED=1` in child environment. Without this, Python dev servers block-buffer stdout when piped, causing delayed error delivery. _(Pitfall 1.1)_
4. **Shutdown Guard**: Boolean flag prevents double shutdown from rapid SIGINT/SIGTERM. _(Pitfall 5.2)_
5. **Global Error Handlers**: `process.on('uncaughtException')` and `process.on('unhandledRejection')` log to stderr and trigger graceful shutdown. _(Pitfall 3.2)_
6. **EPIPE Detection**: Error listener on `process.stdout` detects broken pipe (client crash) and triggers shutdown. _(Pitfall 3.3)_

### P1 — Deferred to Future Hardening Pass

7. **Multi-line Stack Trace Accumulator**: Buffer consecutive lines that belong to the same stack trace before passing to parsers. _(Pitfall 4.2)_
8. **fs.watch Polling Fallback**: Detect Docker/NFS mounts and fall back to stat-based polling. _(Pitfall 2.2)_
9. **Log Rotation Inode Detection**: Check inode on watch events to detect rename-based rotation. _(Pitfall 2.3)_
10. **fs.watch Debounce**: 50ms debounce on watch callbacks to prevent duplicate reads. _(Pitfalls 2.1, 2.6)_
11. **stdout Guard**: Intercept accidental stdout writes from dependencies. _(Pitfall 3.1)_

---

## Security Considerations

1. **Secret redaction is the first pipeline stage** — raw lines are redacted before parsing, scoring, fingerprinting, or storage. No unredacted data exists in memory beyond the initial line read.
2. **No environment variable exposure** — TracePulse inherits the user's env for the child process but never logs, stores, or exposes env vars via MCP.
3. **Input validation on MCP tool params** — `since` must be a positive number, `limit` must be a positive integer ≤ 100, `source` must be a valid EventSource enum value. Invalid params return an MCP error, not a crash.
4. **No file system writes** — Phase 1 is fully ephemeral. No files are created, no state is persisted. This eliminates path traversal and file corruption risks.
5. **Child process isolation** — The child process runs with the user's permissions. TracePulse does not elevate privileges or modify the child's environment.
