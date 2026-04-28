# Implementation Plan: Phase 1 Core Pipeline

## Overview

Phase 1 delivers the MVP: "What broke?" — process spawning/attachment, error parsing, signal scoring, ring buffer, secret redaction, and 4 MCP tools. The agent can see dev server errors without manual copy-paste.

**Architecture References:**
- [Feature & Architecture Analysis](../../../docs/ideas/feature-architecture-analysis.md) — Decisions 1-7
- ADR-001 (to be created in Phase 1 Step 1)

**Key Principles:**
- stdout is reserved for MCP JSON-RPC — all diagnostics to stderr
- Works with ANY MCP-compatible agent — no agent-specific code
- Zero config for basic usage
- Secret redaction before all storage — no secrets in MCP responses

**Development Approach — TDD MANDATORY:**
- **RED → GREEN → REFACTOR**: Write failing tests FIRST, then minimal implementation, then refactor
- NEVER write implementation code before its test
- Each phase below follows strict TDD ordering: tests before implementation
- See testing-standards.md for complete TDD guidelines

**Testing Strategy:**
- Unit tests for every module (parsers, pipeline stages, ring buffer, MCP tools)
- Integration tests for end-to-end pipeline flow and MCP tool calls
- All tests in `tests/unit/` and `tests/integration/` — never co-located

## Tasks

### Phase 1: Foundation — Types, Constants, and Project Scaffolding

#### Step 1: Project Setup and ADR

- [ ] 1.1 Create ADR-001 for tech stack and architecture decisions
  - Document: TypeScript + Node.js 22+, stdio MCP transport, spawn-or-attach model, framework-specific regex + JSON fallback, salience-scored events (Decision 7)
  - File: `docs/decisions/ADR-001-tech-stack-architecture.md`

- [ ] 1.2 Create domain constants
  - Event sources, log levels, signal strength tiers
  - Ring buffer max (500), message max (500 chars), stack frame max (15), raw line max (1000 chars)
  - Signal scoring factors (points per condition from Decision 7)
  - Secret redaction patterns
  - Files: `src/constants/events.ts`, `src/constants/limits.ts`, `src/constants/scoring.ts`, `src/constants/redaction.ts`

#### Step 2: Core Type Definitions — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 2.1 Write unit tests for type validation helpers
  - Test RuntimeEvent creation with valid fields
  - Test EventSource, LogLevel, SignalStrength type guards
  - Test EventFilters validation (since must be positive, limit must be positive integer ≤ 100)
  - File: `tests/unit/types/events.test.ts`
  - _Requirements: US-10, US-14_

**GREEN Phase: Implement to Pass Tests**
- [ ] 2.2 Implement core type definitions and validation
  - RuntimeEvent, EventContext, ParsedError, ErrorParser, ScoringHints interfaces
  - Collector interface, EventBuffer interface, EventFilters interface
  - Type guard functions for runtime validation of MCP tool params
  - Files: `src/types/events.ts`, `src/types/parsers.ts`, `src/types/collectors.ts`
  - _Requirements: US-10, US-14_

**REFACTOR Phase**
- [ ] 2.3 Review type exports and ensure barrel files are clean
  - Verify all public types are re-exported from `src/types/index.ts`

#### Checkpoint: Phase 1 Complete

- [ ] All tests passing
- [ ] No linting errors (`npm run lint`)
- [ ] Type check clean (`npm run typecheck`)
- [ ] ADR-001 committed
- [ ] Constants and types are the foundation for all subsequent phases

---

### Phase 2: Secret Redaction — The First Pipeline Stage

Secret redaction must be built first because it runs before everything else in the pipeline. No raw data enters the system unredacted.

#### Step 3: Secret Redactor — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 3.1 Write unit tests for secret redactor
  - Test API key redaction: `sk-abc123` → `[REDACTED]`, `AKIAIOSFODNN7EXAMPLE` → `[REDACTED]`
  - Test Bearer token redaction: `Bearer eyJhbGci...` → `Bearer [REDACTED]`
  - Test Basic auth redaction: `Basic dXNlcjpwYXNz` → `Basic [REDACTED]`
  - Test key-value secrets: `password=hunter2` → `password=[REDACTED]`
  - Test connection string credentials: `postgres://user:pass@host` → `postgres://[REDACTED]@host`
  - Test PEM block redaction
  - Test JWT token redaction
  - Test GitHub token prefixes: `ghp_`, `gho_`, `glpat-`
  - Test Slack token prefixes: `xoxb-`, `xoxp-`
  - Test that non-secret content is NOT modified
  - Test multiple secrets in one line
  - Test empty string and null-byte handling
  - File: `tests/unit/pipeline/secret-redactor.test.ts`
  - _Requirements: US-13_

**GREEN Phase: Implement to Pass Tests**
- [ ] 3.2 Implement secret redactor
  - Regex-based pattern matching using patterns from `src/constants/redaction.ts`
  - `redact(line: string): string` — pure function, no side effects
  - All patterns compiled once at module load, not per-call
  - File: `src/pipeline/secret-redactor.ts`
  - _Requirements: US-13_

**REFACTOR Phase**
- [ ] 3.3 Optimize regex performance
  - Ensure no catastrophic backtracking on pathological input
  - Add 10ms timeout guard per pattern (skip pattern on timeout)
  - Verify tests still pass

#### Checkpoint: Phase 2 Complete

- [ ] All tests passing
- [ ] Secret redactor handles all documented patterns
- [ ] No false positives on common log content
- [ ] Security checkpoint: verify no secret patterns are missed by reviewing common credential formats

---

### Phase 3: Error Parsers — Framework-Specific Extraction

#### Step 4: Node.js Error Parser — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 4.1 Write unit tests for Node.js error parser
  - Test `TypeError: Cannot read properties of undefined (reading 'x')` with stack trace
  - Test `ReferenceError: x is not defined`
  - Test `SyntaxError: Unexpected token`
  - Test `Error: ENOENT: no such file or directory`
  - Test stack trace extraction (file, line, column from first user-code frame)
  - Test skipping `node_modules` and `node:internal` frames
  - Test `canParse` returns false for non-Node.js errors
  - Test truncation of stack traces beyond 15 frames
  - File: `tests/unit/parsers/node-parser.test.ts`
  - _Requirements: US-4_

**GREEN Phase: Implement to Pass Tests**
- [ ] 4.2 Implement Node.js error parser
  - Regex patterns for standard Node.js error types
  - Stack trace frame extraction with user-code detection
  - Sets `context.framework = 'node'`, `context.error_type` to error class name
  - File: `src/parsers/node-parser.ts`
  - _Requirements: US-4_

#### Step 5: Python Error Parser — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 5.1 Write unit tests for Python error parser
  - Test `Traceback (most recent call last):` multi-line format
  - Test `ImportError`, `TypeError`, `ValueError`, `KeyError` extraction
  - Test file path and line number extraction from traceback frames
  - Test `canParse` returns false for non-Python errors
  - File: `tests/unit/parsers/python-parser.test.ts`
  - _Requirements: US-5_

**GREEN Phase: Implement to Pass Tests**
- [ ] 5.2 Implement Python error parser
  - Multi-line traceback parsing
  - Sets `context.framework = 'python'`, `context.error_type` to exception class
  - File: `src/parsers/python-parser.ts`
  - _Requirements: US-5_

#### Step 6: Go Error Parser — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 6.1 Write unit tests for Go error parser
  - Test `goroutine 1 [running]:` panic format
  - Test `panic: runtime error: index out of range`
  - Test file path and line extraction from Go stack frames
  - Test `canParse` returns false for non-Go errors
  - File: `tests/unit/parsers/go-parser.test.ts`
  - _Requirements: US-6_

**GREEN Phase: Implement to Pass Tests**
- [ ] 6.2 Implement Go error parser
  - File: `src/parsers/go-parser.ts`
  - _Requirements: US-6_

#### Step 7: Java Error Parser — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 7.1 Write unit tests for Java error parser
  - Test `Exception in thread "main" java.lang.NullPointerException`
  - Test `at com.example.MyClass.myMethod(MyClass.java:42)` frame extraction
  - Test `Caused by:` chained exceptions
  - Test skipping JDK internal frames (`java.lang.`, `sun.reflect.`)
  - Test `canParse` returns false for non-Java errors
  - File: `tests/unit/parsers/java-parser.test.ts`
  - _Requirements: US-7_

**GREEN Phase: Implement to Pass Tests**
- [ ] 7.2 Implement Java error parser
  - File: `src/parsers/java-parser.ts`
  - _Requirements: US-7_

#### Step 8: Rust Error Parser — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 8.1 Write unit tests for Rust error parser
  - Test `thread 'main' panicked at 'index out of bounds'`
  - Test file path and line extraction from panic location
  - Test `RUST_BACKTRACE` output parsing
  - Test `canParse` returns false for non-Rust errors
  - File: `tests/unit/parsers/rust-parser.test.ts`
  - _Requirements: US-8_

**GREEN Phase: Implement to Pass Tests**
- [ ] 8.2 Implement Rust error parser
  - File: `src/parsers/rust-parser.ts`
  - _Requirements: US-8_

#### Step 9: JSON Structured Log Parser — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 9.1 Write unit tests for JSON log parser
  - Test pino format: `{"level":50,"msg":"Connection refused","time":1714200000000}`
  - Test structlog format: `{"event":"request_failed","level":"error","timestamp":"2026-04-27T12:00:00Z"}`
  - Test logback JSON: `{"timestamp":"...","level":"ERROR","message":"...","stack_trace":"..."}`
  - Test trace_id extraction from `trace_id`, `traceId`, `x-datadog-trace-id` fields
  - Test `canParse` returns false for non-JSON lines
  - Test `canParse` returns false for JSON without level/message fields
  - Test malformed JSON (partial, truncated) does not throw
  - File: `tests/unit/parsers/json-log-parser.test.ts`
  - _Requirements: US-9_

**GREEN Phase: Implement to Pass Tests**
- [ ] 9.2 Implement JSON structured log parser
  - Auto-detect JSON lines, map common field names to RuntimeEvent fields
  - File: `src/parsers/json-log-parser.ts`
  - _Requirements: US-9_

#### Step 10: Parser Registry — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 10.1 Write unit tests for parser registry
  - Test parser ordering (JSON first, then Node, Python, Go, Java, Rust)
  - Test first-match-wins behavior
  - Test fallback to null when no parser matches
  - Test that parser exceptions are caught and logged (not propagated)
  - File: `tests/unit/pipeline/parser-registry.test.ts`
  - _Requirements: US-4 through US-9_

**GREEN Phase: Implement to Pass Tests**
- [ ] 10.2 Implement parser registry
  - Ordered list of ErrorParser implementations
  - Try each parser's `canParse` → `parse` in order
  - Catch and log parser exceptions
  - File: `src/pipeline/parser-registry.ts`
  - _Requirements: US-4 through US-9_

**REFACTOR Phase**
- [ ] 10.3 Review all parsers for consistency
  - Ensure all parsers follow the same ErrorParser interface contract
  - Verify scoring_hints are populated consistently across parsers

#### Checkpoint: Phase 3 Complete

- [ ] All 6 parsers passing their unit tests
- [ ] Parser registry dispatches correctly
- [ ] No parser throws on malformed input
- [ ] All tests passing, lint clean, typecheck clean

---

### Phase 4: Pipeline Core — Normalization, Scoring, Fingerprinting

#### Step 11: Fingerprinter — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 11.1 Write unit tests for fingerprinter
  - Test same error produces same fingerprint (deterministic)
  - Test different errors produce different fingerprints
  - Test message normalization strips timestamps, PIDs, memory addresses, UUIDs
  - Test fingerprint stability across whitespace variations
  - Test fingerprint includes source and file:line when available
  - Test fingerprint without file:line (still produces valid hash)
  - File: `tests/unit/pipeline/fingerprinter.test.ts`
  - _Requirements: US-11_

**GREEN Phase: Implement to Pass Tests**
- [ ] 11.2 Implement fingerprinter
  - SHA-256 hash of normalized `source|message|file:line`
  - Message normalization: strip timestamps, PIDs, addresses, UUIDs, collapse whitespace
  - File: `src/pipeline/fingerprinter.ts`
  - _Requirements: US-11_

#### Step 12: Signal Scorer — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 12.1 Write unit tests for signal scorer
  - Test unhandled exception with user-code stack trace scores ≥ 75 (high)
  - Test error-level log without stack trace scores 10-30 (medium or low)
  - Test warning-level log scores 5-15 (low)
  - Test HTTP 5xx with stack trace scores high
  - Test first occurrence bonus (+10)
  - Test recurrence penalty (-5 at 3+ occurrences)
  - Test score clamping to [0, 100]
  - Test signal_strength derivation: high (≥50), medium (20-49), low (<20)
  - Test all scoring factors use named constants (not magic numbers)
  - File: `tests/unit/pipeline/signal-scorer.test.ts`
  - _Requirements: US-14_

**GREEN Phase: Implement to Pass Tests**
- [ ] 12.2 Implement signal scorer
  - Additive scoring using factors from `src/constants/scoring.ts`
  - Pure function: `score(hints: ScoringHints, level: LogLevel, occurrenceCount: number) → { signal_score, signal_strength }`
  - File: `src/pipeline/signal-scorer.ts`
  - _Requirements: US-14_

#### Step 13: Event Normalizer — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 13.1 Write unit tests for event normalizer
  - Test ParsedError → RuntimeEvent conversion with all fields populated
  - Test raw line → default info RuntimeEvent when no parser matched
  - Test message truncation at 500 chars with `[truncated]` suffix
  - Test stack trace truncation at 15 frames
  - Test raw line truncation at 1000 chars
  - Test UUID generation (valid v4 format)
  - Test default service is 'main'
  - Test default occurrence_count is 1
  - Test first_seen equals timestamp on creation
  - File: `tests/unit/pipeline/event-normalizer.test.ts`
  - _Requirements: US-10_

**GREEN Phase: Implement to Pass Tests**
- [ ] 13.2 Implement event normalizer
  - Converts ParsedError + raw line + source → RuntimeEvent
  - Calls fingerprinter and signal scorer
  - Applies truncation limits from `src/constants/limits.ts`
  - File: `src/pipeline/event-normalizer.ts`
  - _Requirements: US-10_

**REFACTOR Phase**
- [ ] 13.3 Review pipeline stage interfaces for consistency
  - Ensure clean data flow: redactor → parser → normalizer → buffer

#### Checkpoint: Phase 4 Complete

- [ ] Fingerprinter, scorer, and normalizer all passing unit tests
- [ ] Pipeline stages compose cleanly (output of one is input to next)
- [ ] All tests passing, lint clean, typecheck clean

---

### Phase 5: Ring Buffer — Bounded Event Storage

#### Step 14: Ring Buffer — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 14.1 Write unit tests for ring buffer
  - Test push and retrieve single event
  - Test FIFO eviction at capacity (500 events)
  - Test dedup: same fingerprint increments occurrence_count, updates timestamp
  - Test dedup: first_seen does NOT change on duplicate
  - Test query with `since` filter
  - Test query with `source` filter
  - Test query with `level` filter (minimum level)
  - Test query with `limit` parameter
  - Test query with combined filters
  - Test `count()` returns correct count with and without filters
  - Test `clear()` removes all events and returns count
  - Test `size` property reflects current event count
  - Test empty buffer returns empty array (not error)
  - Test buffer handles 500+ events without memory growth
  - File: `tests/unit/store/ring-buffer.test.ts`
  - _Requirements: US-11, US-12_

**GREEN Phase: Implement to Pass Tests**
- [ ] 14.2 Implement ring buffer
  - Pre-allocated array of size 500 (from constants)
  - Circular write pointer with modulo arithmetic
  - `Map<string, number>` for fingerprint → index lookup
  - Dedup on push: if fingerprint exists, update in place
  - Eviction: update fingerprint map when oldest event is overwritten
  - Query: iterate buffer, apply filters, collect results
  - File: `src/store/ring-buffer.ts`
  - _Requirements: US-11, US-12_

**REFACTOR Phase**
- [ ] 14.3 Optimize query performance
  - Ensure queries don't copy the entire buffer
  - Verify O(1) dedup lookups via fingerprint map

#### Checkpoint: Phase 5 Complete

- [ ] Ring buffer handles all CRUD operations correctly
- [ ] Dedup works with fingerprint index
- [ ] FIFO eviction is correct at capacity
- [ ] All tests passing, lint clean, typecheck clean

---

### Phase 6: Collectors — Process Spawning and Log File Tailing

#### Step 15: Process Spawner — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 15.1 Write unit tests for process spawner
  - Test spawning a simple command (`echo "hello"`) and capturing stdout
  - Test stderr capture is tagged with `source: 'server-stderr'`
  - Test stdout capture is tagged with `source: 'server-stdout'`
  - Test line splitting handles partial lines at stream boundaries
  - Test child exit detection (clean exit, crash with non-zero code)
  - Test spawn failure (command not found) calls error handler
  - Test `isConnected()` returns true while child is running, false after exit
  - Test `stop()` sends SIGTERM to child
  - File: `tests/unit/collectors/process-spawner.test.ts`
  - _Requirements: US-1, US-3_

**GREEN Phase: Implement to Pass Tests**
- [ ] 15.2 Implement process spawner
  - `node:child_process.spawn` with `shell: true`, inherited env
  - Line splitting via `node:readline` or manual buffer splitting
  - Synthetic events for process lifecycle (started, exited)
  - File: `src/collectors/process-spawner.ts`
  - _Requirements: US-1, US-3_

#### Step 16: Log File Tailer — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 16.1 Write unit tests for log file tailer
  - Test tailing a file that exists — reads only new lines appended after start
  - Test waiting for file creation (file doesn't exist yet)
  - Test file truncation detection (rotation) — continues from new beginning
  - Test `isConnected()` returns true while tailing
  - Test `stop()` closes file handles
  - Test binary/non-UTF-8 data is skipped gracefully
  - File: `tests/unit/collectors/log-file-tailer.test.ts`
  - _Requirements: US-2_

**GREEN Phase: Implement to Pass Tests**
- [ ] 16.2 Implement log file tailer
  - `node:fs.watch` for change detection + `node:fs.createReadStream` for reading
  - Track file size for truncation detection
  - Configurable `source` tag (default: `server-stdout`)
  - File: `src/collectors/log-file-tailer.ts`
  - _Requirements: US-2_

#### Step 17: Graceful Shutdown — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 17.1 Write unit tests for graceful shutdown
  - Test SIGTERM forwarding to child process
  - Test 5-second timeout before SIGKILL
  - Test exit code propagation from child
  - Test shutdown on stdio pipe break
  - File: `tests/unit/collectors/shutdown.test.ts`
  - _Requirements: US-3_

**GREEN Phase: Implement to Pass Tests**
- [ ] 17.2 Implement graceful shutdown in process spawner
  - Signal handlers for SIGINT/SIGTERM
  - 5-second timeout with SIGKILL fallback
  - stdio pipe error detection
  - Integrated into `src/collectors/process-spawner.ts`
  - _Requirements: US-3_

**REFACTOR Phase**
- [ ] 17.3 Review collector interface consistency
  - Ensure both collectors implement the same Collector interface
  - Verify error handling is consistent between spawner and tailer

#### Checkpoint: Phase 6 Complete

- [ ] Process spawner captures stdout/stderr correctly
- [ ] Log file tailer handles creation, rotation, and binary data
- [ ] Graceful shutdown works for both SIGINT/SIGTERM and pipe break
- [ ] All tests passing, lint clean, typecheck clean

---

### Phase 7: MCP Server — Tool Registration and Wiring

#### Step 18: MCP Tool Handlers — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 18.1 Write unit tests for MCP tool handlers
  - Test `get_errors` returns error/warn events sorted by signal_score descending
  - Test `get_errors` with `since` filter
  - Test `get_errors` with `source` filter
  - Test `get_errors` with `limit` parameter (default 20)
  - Test `get_errors` returns empty array when no errors
  - Test `get_server_logs` returns all levels sorted by timestamp descending
  - Test `get_server_logs` with `level` minimum filter
  - Test `get_server_logs` with `limit` parameter (default 50)
  - Test `get_runtime_status` returns correct connected/error_count/last_error_time
  - Test `get_runtime_status` returns `last_error_time: null` when no errors
  - Test `clear_errors` returns cleared_count and empties buffer
  - Test invalid params return MCP error (not crash)
  - File: `tests/unit/mcp/server.test.ts`
  - _Requirements: US-15, US-16, US-17, US-18_

**GREEN Phase: Implement to Pass Tests**
- [ ] 18.2 Implement MCP tool handlers
  - Pure functions that read from EventBuffer — no side effects
  - Input validation for all parameters
  - JSON serialization of RuntimeEvent arrays
  - File: `src/mcp/server.ts`
  - _Requirements: US-15, US-16, US-17, US-18_

**REFACTOR Phase**
- [ ] 18.3 Review MCP tool descriptions for agent clarity
  - Ensure tool descriptions guide agents toward progressive disclosure
  - Verify response format matches MCP SDK expectations

#### Checkpoint: Phase 7 Complete

- [ ] All 4 MCP tools return correct data
- [ ] Input validation rejects invalid params gracefully
- [ ] Tool handlers are pure functions reading from the buffer
- [ ] All tests passing, lint clean, typecheck clean

---

### Phase 8: CLI Entry Point and Integration

#### Step 19: CLI Argument Parsing — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 19.1 Write unit tests for CLI argument parsing
  - Test `start "npm run dev"` extracts command string
  - Test `attach --log-file ./server.log` extracts file path
  - Test `--version` flag
  - Test `--help` flag
  - Test invalid command prints error to stderr
  - Test missing required args prints error to stderr
  - File: `tests/unit/cli.test.ts`
  - _Requirements: US-19_

**GREEN Phase: Implement to Pass Tests**
- [ ] 19.2 Implement CLI argument parsing
  - Manual `process.argv` parsing (no library — surface is small)
  - Route to ProcessSpawner or LogFileTailer based on subcommand
  - Wire collector → pipeline → buffer → MCP server
  - All output to stderr except MCP JSON-RPC on stdout
  - File: `src/cli.ts`
  - _Requirements: US-19_

#### Step 20: Integration Tests

- [ ] 20.1 Write integration test: full pipeline flow
  - Spawn a test process that outputs known error patterns
  - Verify errors flow through: redaction → parsing → normalization → scoring → buffer
  - Query buffer and verify RuntimeEvent fields are correct
  - File: `tests/integration/pipeline-flow.test.ts`
  - _Requirements: US-1, US-4, US-10, US-11, US-13, US-14_

- [ ] 20.2 Write integration test: MCP tool calls
  - Start MCP server with a pre-populated buffer
  - Call each tool and verify response format
  - Verify get_errors sorts by signal_score
  - Verify get_server_logs sorts by timestamp
  - Verify get_runtime_status reflects buffer state
  - Verify clear_errors empties the buffer
  - File: `tests/integration/mcp-tools.test.ts`
  - _Requirements: US-15, US-16, US-17, US-18_

- [ ] 20.3 Write integration test: secret redaction end-to-end
  - Spawn a process that outputs lines containing secrets
  - Verify no secrets appear in any MCP tool response
  - Verify no secrets appear in the ring buffer
  - File: `tests/integration/secret-redaction-e2e.test.ts`
  - _Requirements: US-13_

#### Checkpoint: Phase 8 Complete

- [ ] CLI parses all documented commands correctly
- [ ] Full pipeline integration tests pass
- [ ] MCP tools return correct data from a live pipeline
- [ ] Secret redaction verified end-to-end
- [ ] All tests passing, lint clean, typecheck clean

---

### Phase 9: Build, Package, and Security Review

#### Step 21: Build and Package

- [ ] 21.1 Verify tsup build produces working CLI
  - `npm run build` succeeds
  - `node dist/cli.js --version` prints version to stderr
  - `node dist/cli.js start "echo hello"` spawns process and starts MCP server
  - Verify `bin` entry in package.json points to correct dist file

- [ ] 21.2 Verify `npx` execution works
  - `npx tracepulse start "echo hello"` works from a clean directory
  - `npx tracepulse --help` prints usage to stderr

#### Step 22: Security Checkpoint

- [ ] 22.1 Security review of secret redaction
  - Review all redaction patterns against common credential formats
  - Verify no secrets leak through any code path (message, stack_trace, raw, context fields)
  - Verify diagnostic stderr logs don't contain secrets

- [ ] 22.2 Security review of input handling
  - Verify MCP tool params are validated (no injection via `since`, `source`, `limit`)
  - Verify malformed log input (binary, null bytes, extremely long lines) doesn't crash
  - Verify child process environment is not exposed via MCP

- [ ] 22.3 Security review of process management
  - Verify child process runs with user permissions (no privilege escalation)
  - Verify graceful shutdown doesn't leave orphan processes

#### Step 22.5: Pipeline Hardening (P0 Items)

> Based on [Collector Pitfalls & Hardening Guide](../../../docs/references/collector-pitfalls-hardening.md).
> These items prevent data corruption, parser failures, and silent crashes.

- [x] 22.5.1 Strip ANSI escape codes before parsing
  - Regex: `/\x1b\[[0-9;]*m/g` applied in pipeline before secret redactor
  - Constant: `ANSI_ESCAPE_REGEX` in `src/constants/limits.ts`
  - Wired in `createPipeline()` in `src/cli.ts`
  - _Hardening ref: Pitfall 4.4 — colored dev server output breaks regex parsers_
  - _Requirements: NFR-3.5, AC-10.6_

- [x] 22.5.2 Line length guard (10KB max before parsing)
  - Constant: `MAX_PARSE_INPUT_LENGTH` (10,000) in `src/constants/limits.ts`
  - Truncation applied in `createPipeline()` before `registry.parse()`
  - _Hardening ref: Pitfalls 1.8, 6.2 — prevents ReDoS on pathological input_
  - _Requirements: NFR-3.6, AC-10.7_

- [x] 22.5.3 Set `PYTHONUNBUFFERED=1` in spawner environment
  - Added to `env` object in `src/collectors/process-spawner.ts`
  - _Hardening ref: Pitfall 1.1 — Python block-buffers stdout when piped_
  - _Requirements: NFR-3.7, AC-1.5_

- [x] 22.5.4 Global `uncaughtException` / `unhandledRejection` handlers
  - Added in `main()` in `src/cli.ts`
  - Logs to stderr, sets `process.exitCode = 1`
  - _Hardening ref: Pitfall 3.2 — unhandled errors crash MCP server silently_
  - _Requirements: NFR-3.9_

- [x] 22.5.5 Shutdown guard flag (prevent double shutdown)
  - `let shuttingDown = false` in `main()` in `src/cli.ts`
  - Subsequent SIGINT/SIGTERM ignored while shutdown in progress
  - _Hardening ref: Pitfall 5.2 — rapid Ctrl+C causes race condition_
  - _Requirements: NFR-3.8_

- [x] 22.5.6 EPIPE detection on stdout
  - Error listener on `process.stdout` in `main()` in `src/cli.ts`
  - Triggers graceful shutdown when MCP client disconnects
  - _Hardening ref: Pitfall 3.3 — broken pipe leaves TracePulse running blind_
  - _Requirements: NFR-3.10_

#### Step 23: Documentation and Changelog

- [ ] 23.1 Update README.md with Phase 1 status and usage
  - Document `start` and `attach` commands
  - Document MCP tool surface (4 tools with descriptions)
  - Update status from "Pre-alpha" to "Alpha — Phase 1 complete"

- [ ] 23.2 Update changelog
  - Add Phase 1 entries to `docs/changelogs/CHANGELOG.md`
  - Document all new features, MCP tools, and supported error formats

- [ ] 23.3 Update roadmap
  - Mark Phase 1 as complete in `docs/roadmap/roadmap.md`
  - Link ADR-001

#### Checkpoint: Phase 9 Complete — PHASE 1 DONE

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Build produces working CLI
- [ ] `npx tracepulse start "npm run dev"` works end-to-end
- [ ] Security checkpoint passed
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] No linting errors
- [ ] Type check clean
- [ ] Ready for Phase 2 (watch_for_errors, hot-reload detection)

---

## TDD Reminders

**Before writing ANY implementation code, ask yourself:**
1. Have I written a test for this functionality?
2. Have I seen that test FAIL for the right reason?
3. Am I writing the MINIMAL code to make the test pass?

**If the answer to any of these is NO, STOP and write the test first.**

## Task Status Legend

- `[ ]` = Not started
- `[-]` = In progress
- `[x]` = Completed
