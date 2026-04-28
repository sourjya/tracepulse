# Phase 1: Core Pipeline — Requirements

## Overview

Phase 1 delivers the MVP: **"What broke?"** — an AI coding agent can see dev server errors without manual copy-paste. The developer runs their dev server through TracePulse (or attaches to a log file), and any MCP-compatible agent can query structured, scored runtime events.

**Architecture Reference:** [Feature & Architecture Analysis](../../../docs/ideas/feature-architecture-analysis.md)

---

## User Stories

### Process Management

1. **US-1: Spawn dev server** — As a developer, I want to run `npx tracepulse start "npm run dev"` so that TracePulse spawns my dev server as a child process and captures its stdout/stderr.
   - **AC-1.1:** TracePulse spawns the command via `node:child_process`, inheriting the user's environment variables.
   - **AC-1.2:** stdout and stderr from the child process are captured as separate streams, each tagged with the correct `source` (`server-stdout` or `server-stderr`).
   - **AC-1.3:** TracePulse's own stdout is reserved exclusively for MCP JSON-RPC messages. All diagnostic output goes to stderr.
   - **AC-1.4:** If the command fails to spawn (e.g., command not found), TracePulse exits with a non-zero code and a clear error message on stderr.
   - **AC-1.5:** The spawner sets `PYTHONUNBUFFERED=1` in the child environment to prevent Python output buffering. _(Pitfall 1.1)_

2. **US-2: Attach to log file** — As a developer, I want to run `npx tracepulse attach --log-file ./server.log` so that TracePulse tails an existing log file and exposes its contents as MCP tools.
   - **AC-2.1:** TracePulse tails the file from the current end (not from the beginning), reading only new lines appended after startup.
   - **AC-2.2:** If the file does not exist at startup, TracePulse waits for it to be created (up to 30 seconds), then starts tailing.
   - **AC-2.3:** If the file is rotated (truncated and rewritten), TracePulse detects the truncation and continues tailing from the new beginning.
   - **AC-2.4:** Events from log file tailing use `source: 'server-stdout'` by default, overridable via `--source` flag.

3. **US-3: Graceful shutdown** — As a developer, I want TracePulse to forward SIGINT/SIGTERM to the child process so that my dev server shuts down cleanly when I stop TracePulse.
   - **AC-3.1:** On SIGINT or SIGTERM, TracePulse forwards the signal to the child process.
   - **AC-3.2:** TracePulse waits up to 5 seconds for the child to exit. If it hasn't exited, TracePulse sends SIGKILL.
   - **AC-3.3:** TracePulse exits with the child's exit code (or 1 if SIGKILL was required).
   - **AC-3.4:** If the MCP stdio pipe breaks (IDE/agent crash), TracePulse detects it and initiates the same shutdown sequence.

### Error Parsing & Normalization

4. **US-4: Parse Node.js errors** — As an agent, I want Node.js stack traces parsed into structured RuntimeEvents so that I can see the error type, message, file, and line number without parsing raw text.
   - **AC-4.1:** Parses `TypeError`, `ReferenceError`, `SyntaxError`, and other standard Node.js error formats.
   - **AC-4.2:** Extracts file path, line number, and column number from the first user-code frame (skipping `node_modules` and `node:internal` frames).
   - **AC-4.3:** Captures up to 15 stack trace frames.
   - **AC-4.4:** Sets `context.framework` to `'node'` and `context.error_type` to the error class name.

5. **US-5: Parse Python errors** — As an agent, I want Python tracebacks parsed into structured RuntimeEvents.
   - **AC-5.1:** Parses Python's `Traceback (most recent call last):` format.
   - **AC-5.2:** Extracts file path, line number, and function name from the last user-code frame.
   - **AC-5.3:** Sets `context.framework` to `'python'` and `context.error_type` to the exception class name.

6. **US-6: Parse Go errors** — As an agent, I want Go panic and runtime error stack traces parsed into structured RuntimeEvents.
   - **AC-6.1:** Parses `goroutine N [running]:` panic format and `runtime error:` messages.
   - **AC-6.2:** Extracts file path and line number from the first user-code frame.
   - **AC-6.3:** Sets `context.framework` to `'go'`.

7. **US-7: Parse Java errors** — As an agent, I want Java exception stack traces parsed into structured RuntimeEvents.
   - **AC-7.1:** Parses `Exception in thread "main"` and standard `at com.example.Class.method(File.java:42)` format.
   - **AC-7.2:** Extracts class, method, file, and line from the first application frame (skipping JDK internals).
   - **AC-7.3:** Sets `context.framework` to `'java'` and `context.error_type` to the exception class name.

8. **US-8: Parse Rust errors** — As an agent, I want Rust panic messages and backtraces parsed into structured RuntimeEvents.
   - **AC-8.1:** Parses `thread 'main' panicked at` format and `RUST_BACKTRACE` output.
   - **AC-8.2:** Extracts file path and line number from the panic location.
   - **AC-8.3:** Sets `context.framework` to `'rust'`.

9. **US-9: Parse JSON structured logs** — As an agent, I want JSON-formatted log lines (pino, structlog, logback JSON) parsed into structured RuntimeEvents.
   - **AC-9.1:** Auto-detects lines that are valid JSON objects.
   - **AC-9.2:** Maps common fields: `level`/`severity` → `level`, `msg`/`message` → `message`, `err`/`error`/`stack` → `stack_trace`, `time`/`timestamp` → `timestamp`.
   - **AC-9.3:** Extracts `trace_id` from `trace_id`, `traceId`, `x-datadog-trace-id`, or `traceparent` fields if present.
   - **AC-9.4:** Falls through to regex parsers if the JSON line doesn't contain error-level content.

10. **US-10: Event normalization** — As an agent, I want all parsed errors normalized into a single RuntimeEvent schema regardless of source language or format.
    - **AC-10.1:** Every event has all required RuntimeEvent fields populated (id, timestamp, source, service, level, message, fingerprint, signal_score, signal_strength, context, raw, first_seen, occurrence_count).
    - **AC-10.2:** `message` is truncated to 500 characters with `[truncated]` suffix if exceeded.
    - **AC-10.3:** `stack_trace` retains at most 15 frames.
    - **AC-10.4:** `raw` is truncated to 1000 characters.
    - **AC-10.5:** Lines that match no parser are stored as `level: 'info'` events with the raw line as the message.
    - **AC-10.6:** ANSI escape codes are stripped from all log lines before parsing. _(Pitfall 4.4)_
    - **AC-10.7:** Lines exceeding 10KB are truncated before entering the parser pipeline. _(Pitfall 1.8)_

### Fingerprinting & Deduplication

11. **US-11: Stable fingerprinting** — As an agent, I want duplicate errors grouped by fingerprint so that I see each unique error once with an occurrence count, not hundreds of identical entries.
    - **AC-11.1:** Fingerprint is a stable hash of: `source` + normalized message (stripped of variable parts like timestamps, PIDs, memory addresses) + `file:line` (if available).
    - **AC-11.2:** Two identical errors produce the same fingerprint across restarts (deterministic).
    - **AC-11.3:** When a duplicate is detected, `occurrence_count` increments and `timestamp` updates to the latest occurrence. `first_seen` remains unchanged.

### Ring Buffer

12. **US-12: Bounded event storage** — As a system, I want events stored in a bounded ring buffer so that memory usage stays constant regardless of how long the dev server runs.
    - **AC-12.1:** Ring buffer holds a maximum of 500 events.
    - **AC-12.2:** When full, the oldest event is evicted to make room for the newest.
    - **AC-12.3:** Eviction does not lose high-signal events preferentially — it is strictly FIFO.
    - **AC-12.4:** All query operations (get_errors, get_server_logs) read from the ring buffer without copying the entire buffer.

### Secret Redaction

13. **US-13: Redact secrets from logs** — As a developer, I want API keys, tokens, passwords, and other secrets stripped from all log output before it enters the ring buffer so that MCP responses never leak credentials.
    - **AC-13.1:** Redaction runs on every raw log line before any parsing or storage.
    - **AC-13.2:** Detects and replaces: API keys (common prefixes like `sk-`, `AKIA`, `ghp_`, `gho_`, `glpat-`), Bearer tokens, Basic auth headers, `password=`, `secret=`, `token=` in query strings and JSON, AWS access keys, private keys (PEM blocks), connection strings with embedded credentials.
    - **AC-13.3:** Replaced with `[REDACTED]` placeholder.
    - **AC-13.4:** Redaction is applied to `message`, `stack_trace`, `raw`, and all `context` string fields in the RuntimeEvent.
    - **AC-13.5:** Redaction patterns are configurable (users can add custom patterns via config).

### Signal Scoring

14. **US-14: Score event signal strength** — As an agent, I want each RuntimeEvent scored 0-100 so that I can prioritize high-signal errors (clear stack traces in user code) over low-signal noise (deprecation warnings).
    - **AC-14.1:** Scoring is additive per Decision 7: unhandled exception/crash (+40), stack trace present (+20), file:line in user code (+15), HTTP 5xx (+15), HTTP 4xx (+10), error-level log (+10), warning-level log (+5), first occurrence/new fingerprint (+10), recurrence 3+ times (-5).
    - **AC-14.2:** Score is clamped to 0-100.
    - **AC-14.3:** `signal_strength` derived from score: `'high'` (≥50), `'medium'` (20-49), `'low'` (<20).
    - **AC-14.4:** Scoring factors are defined as named constants, not magic numbers.

### MCP Tools

15. **US-15: get_errors tool** — As an agent, I want to call `get_errors` to retrieve recent error-level events so that I can see what broke.
    - **AC-15.1:** Returns RuntimeEvent[] filtered to `level: 'error'` and `level: 'warn'`.
    - **AC-15.2:** Accepts optional `since` (Unix ms timestamp), `source` (event source filter), `limit` (max results, default 20).
    - **AC-15.3:** Results are sorted by `signal_score` descending (highest signal first).
    - **AC-15.4:** Returns empty array (not error) when no matching events exist.

16. **US-16: get_server_logs tool** — As an agent, I want to call `get_server_logs` to retrieve recent log events at any level so that I can see the full server output.
    - **AC-16.1:** Returns RuntimeEvent[] including all log levels.
    - **AC-16.2:** Accepts optional `level` (minimum level filter), `since` (Unix ms), `limit` (max results, default 50).
    - **AC-16.3:** Results are sorted by `timestamp` descending (newest first).

17. **US-17: get_runtime_status tool** — As an agent, I want to call `get_runtime_status` to get a quick health check so that I know if the dev server is running and whether there are errors, without fetching full event data.
    - **AC-17.1:** Returns `{ connected: boolean, error_count: number, last_error_time: number | null }`.
    - **AC-17.2:** `connected` is `true` when the child process is running (spawn mode) or the log file is being tailed (attach mode).
    - **AC-17.3:** `error_count` is the count of error-level events currently in the ring buffer.
    - **AC-17.4:** `last_error_time` is the timestamp of the most recent error, or `null` if no errors.
    - **AC-17.5:** Response is ~100 tokens — the cheapest tool call for progressive disclosure.

18. **US-18: clear_errors tool** — As an agent, I want to call `clear_errors` to reset the error buffer so that after fixing a bug, I start with a clean slate for the next verification cycle.
    - **AC-18.1:** Removes all events from the ring buffer.
    - **AC-18.2:** Returns `{ cleared_count: number }` with the count of events that were removed.
    - **AC-18.3:** After clearing, `get_runtime_status` shows `error_count: 0`.

### CLI Entry Point

19. **US-19: CLI commands** — As a developer, I want a CLI with `start` and `attach` subcommands so that I can choose how TracePulse connects to my dev server.
    - **AC-19.1:** `npx tracepulse start "<command>"` spawns the command and starts the MCP server on stdio.
    - **AC-19.2:** `npx tracepulse attach --log-file <path>` tails the file and starts the MCP server on stdio.
    - **AC-19.3:** `npx tracepulse --version` prints the version to stderr and exits.
    - **AC-19.4:** `npx tracepulse --help` prints usage to stderr and exits.
    - **AC-19.5:** Invalid commands print an error message to stderr and exit with code 1.

---

## Non-Functional Requirements

### NFR-1: Performance
- **NFR-1.1:** Event processing latency (raw line → RuntimeEvent in buffer) must be < 5ms for 95th percentile.
- **NFR-1.2:** Ring buffer query operations (get_errors, get_server_logs) must complete in < 2ms for a full 500-event buffer.
- **NFR-1.3:** Memory usage must stay under 50MB for a full 500-event buffer with maximum-length messages and stack traces.
- **NFR-1.4:** TracePulse must not introduce observable latency to the child process's stdout/stderr output.

### NFR-2: Security
- **NFR-2.1:** Secret redaction runs before any storage or parsing — no secrets ever enter the ring buffer.
- **NFR-2.2:** No secrets are logged to stderr diagnostic output.
- **NFR-2.3:** MCP responses never contain raw credentials, tokens, or keys.
- **NFR-2.4:** The child process inherits the user's environment but TracePulse does not log or expose environment variables.

### NFR-3: Reliability
- **NFR-3.1:** TracePulse must not crash on malformed log input (binary data, extremely long lines, null bytes).
- **NFR-3.2:** If a parser throws, the error is caught, logged to stderr, and the raw line is stored as an unparsed info event.
- **NFR-3.3:** Graceful shutdown completes within 6 seconds (5s child wait + 1s cleanup).
- **NFR-3.4:** The MCP server remains responsive even when the child process is producing high-volume output (>1000 lines/second).

### NFR-3A: Pipeline Hardening (from [Collector Pitfalls Guide](../../../docs/references/collector-pitfalls-hardening.md))
- **NFR-3.5:** TracePulse must strip ANSI escape codes from all log lines before parsing. Colored output from dev servers must not interfere with error detection. _(Pitfall 4.4)_
- **NFR-3.6:** Lines exceeding 10KB must be truncated before entering the parser pipeline to prevent ReDoS. _(Pitfalls 1.8, 6.2)_
- **NFR-3.7:** TracePulse must set `PYTHONUNBUFFERED=1` in the child process environment to prevent block-buffered output from Python dev servers. _(Pitfall 1.1)_
- **NFR-3.8:** Signal handlers must be idempotent. Multiple SIGINT/SIGTERM signals must not cause double shutdown or race conditions. _(Pitfall 5.2)_
- **NFR-3.9:** Global `uncaughtException` and `unhandledRejection` handlers must log to stderr and attempt graceful shutdown instead of crashing silently. _(Pitfall 3.2)_
- **NFR-3.10:** TracePulse must detect EPIPE errors on stdout and initiate graceful shutdown when the MCP client disconnects. _(Pitfall 3.3)_
- **NFR-3.11:** Third-party library writes to stdout must not corrupt the MCP JSON-RPC stream. A stdout guard should redirect non-MCP output to stderr. _(Pitfall 3.1)_

### NFR-4: Compatibility
- **NFR-4.1:** Works with any MCP-compatible agent (Kiro, Claude Code, Cursor, Copilot, Cline, Windsurf). No agent-specific code.
- **NFR-4.2:** Requires Node.js 22+ (as specified in `engines` field).
- **NFR-4.3:** Works on Linux and macOS. Windows support is deferred.
- **NFR-4.4:** Zero configuration required for basic usage — `npx tracepulse start "npm run dev"` works without a config file.

### NFR-5: Observability
- **NFR-5.1:** Structured JSON logs to stderr for all significant operations (process spawn, process exit, parser errors, MCP tool calls).
- **NFR-5.2:** Each log entry includes a timestamp and operation type.
- **NFR-5.3:** MCP tool calls log: tool name, parameters, result count, and duration.

---

## Out of Scope (Phase 1)

The following are explicitly **not** part of Phase 1. They are planned for later phases as documented in the [architecture analysis](../../../docs/ideas/feature-architecture-analysis.md).

- **watch_for_errors** — Time-bounded error collection (Phase 2)
- **Hot-reload detection** — Detecting Vite/webpack/nodemon restart events (Phase 2)
- **Build error parsing** — TypeScript/ESLint/Vite compilation errors as a separate category (Phase 2)
- **get_build_errors / get_error_context / get_timeline tools** — (Phase 2)
- **Multi-process monitoring** — Multiple simultaneous processes (Phase 3)
- **Docker Compose log aggregation** — (Phase 3)
- **Frontend-backend correlation** — CDP connection, HTTP correlation (Phase 4)
- **Proactive monitoring / push notifications** — (Phase 5)
- **Configuration file** — TOML/JSON config for multi-service setups (Phase 2+)
- **Custom parser registration** — User-defined regex patterns via config (Phase 2+)
- **Windows support** — Platform-specific quirks deferred
- **Persistence** — Fingerprint history, session replay (Phase 3+)
- **Streamable HTTP transport** — Multi-client MCP scenarios (Phase 3+)
