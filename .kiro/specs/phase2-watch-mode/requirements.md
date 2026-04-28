# Phase 2: Watch Mode — Requirements

## Overview

Phase 2 closes the agent's edit → verify feedback loop. After Phase 1 gives the agent passive visibility into dev server errors, Phase 2 lets the agent **actively wait for results** after making a code change. The agent edits a file, calls `watch_for_errors(15)`, and gets back any new errors that appeared during the hot-reload window — no manual log reading, no polling.

**Prerequisite:** Phase 1 (MVP — "What broke?") must be complete. Phase 2 depends on the RuntimeEvent schema, ring buffer, error parsers, signal scoring, secret redaction, and the Phase 1 MCP tools (`get_errors`, `get_server_logs`, `get_runtime_status`, `clear_errors`).

---

## User Stories

### US-1: Time-Bounded Error Watch

**As** an AI coding agent,
**I want** to call `watch_for_errors(duration_seconds)` after editing a file,
**So that** I can block for N seconds and receive any new errors that appeared during the hot-reload window, confirming whether my fix worked.

**Acceptance Criteria:**

1. `watch_for_errors(duration_seconds)` blocks the MCP tool call for exactly `duration_seconds` (±500ms tolerance).
2. Only errors that arrive **after** the tool call starts are returned — pre-existing errors are excluded.
3. Returns `RuntimeEvent[]` sorted by timestamp ascending.
4. If no errors appear during the window, returns an empty array.
5. `duration_seconds` must be between 1 and 120 inclusive; values outside this range return a validation error.
6. Default `duration_seconds` is 15 when not provided.
7. Optional `source` filter (`server-stdout`, `server-stderr`, `build-error`) limits which event sources are collected.
8. If the dev server process exits during the watch window, the tool returns immediately with any collected errors plus a synthetic `process-exit` event.

### US-2: Hot-Reload Detection

**As** an AI coding agent,
**I want** TracePulse to detect when the dev server hot-reloads after a file change,
**So that** I know the server has restarted and any new errors are from the updated code, not stale state.

**Acceptance Criteria:**

1. TracePulse detects hot-reload events from at least: Vite, webpack-dev-server, nodemon, Next.js dev server, and ts-node-dev.
2. Detection uses pattern matching on stdout/stderr lines (e.g., `compiled successfully`, `ready in`, `watching for file changes`, `restarting due to changes`).
3. Each detected hot-reload injects a synthetic `RuntimeEvent` with `level: 'info'`, `source: 'server-stdout'`, and a descriptive message (e.g., `"Hot-reload detected: Vite compiled successfully in 245ms"`).
4. Hot-reload events have `signal_score: 5` and `signal_strength: 'low'` (informational, not errors).
5. The hot-reload pattern registry is extensible — new patterns can be added via a config file or programmatic API.
6. `watch_for_errors` can optionally wait for a hot-reload event before starting the error collection window (early-return optimization for future consideration, not required for initial implementation).

### US-3: Build Error Parsing

**As** an AI coding agent,
**I want** TracePulse to parse TypeScript compilation errors, ESLint errors, and Vite/webpack build errors into structured `RuntimeEvent` objects,
**So that** I can see exactly which file and line caused a build failure without reading raw compiler output.

**Acceptance Criteria:**

1. TypeScript compilation errors (`TS####`) are parsed into `RuntimeEvent` with `source: 'build-error'`, `context.file`, `context.line`, `context.column`, `context.error_type` (e.g., `TS2345`), and the error message.
2. ESLint errors (from `eslint --format` output in stdout) are parsed with rule name, file, line, column, and severity.
3. Vite/webpack build errors (module not found, syntax errors, transform failures) are parsed with file path and error details.
4. All build errors receive `signal_score >= 50` (high signal) because they block the dev server from serving updated code.
5. Build error parsers follow the same pluggable parser interface established in Phase 1.
6. Multi-line build errors (e.g., TypeScript errors spanning multiple lines) are correctly grouped into a single `RuntimeEvent`.

### US-4: Get Build Errors Tool

**As** an AI coding agent,
**I want** a dedicated `get_build_errors()` MCP tool,
**So that** I can quickly check if there are any current compilation or build failures without filtering through all errors.

**Acceptance Criteria:**

1. `get_build_errors()` returns only `RuntimeEvent` objects with `source: 'build-error'`.
2. Results are sorted by timestamp descending (most recent first).
3. Returns at most `limit` results (default 20, configurable via parameter).
4. Deduplicates by fingerprint — returns only the latest occurrence of each unique build error.
5. If no build errors exist, returns an empty array.

### US-5: Error Context Deep-Dive

**As** an AI coding agent,
**I want** to call `get_error_context(fingerprint)` to get the full details of a specific error including surrounding log context,
**So that** I can understand what was happening around the time of the error and make a more informed fix.

**Acceptance Criteria:**

1. `get_error_context(fingerprint)` accepts a fingerprint string from a previously returned `RuntimeEvent`.
2. Returns `{ error: RuntimeEvent, surrounding_logs: RuntimeEvent[], occurrence_count: number }`.
3. `error` is the most recent occurrence of the error matching the fingerprint, with full untruncated data (up to the raw line limit of 1000 chars).
4. `surrounding_logs` contains all events within ±5 seconds of the error's timestamp, sorted by timestamp ascending.
5. `occurrence_count` is the total number of times this fingerprint has been seen since the buffer was created.
6. If the fingerprint is not found in the buffer, returns a structured error with a clear message.
7. `surrounding_logs` excludes the error event itself (no duplication).
8. `surrounding_logs` is capped at 50 events to prevent token budget blowout.

### US-6: Unified Timeline

**As** an AI coding agent,
**I want** to call `get_timeline(since, duration_seconds)` to get a chronological stream of ALL events in a time window,
**So that** I can see the full picture of what happened — errors, warnings, info logs, hot-reload events — in temporal order.

**Acceptance Criteria:**

1. `get_timeline(since, duration_seconds)` returns all `RuntimeEvent` objects within the specified time window.
2. `since` is a Unix timestamp in milliseconds. Events with `timestamp >= since` are included.
3. `duration_seconds` defines the window length. Events with `timestamp <= since + (duration_seconds * 1000)` are included.
4. If `duration_seconds` is omitted, returns all events from `since` to now.
5. Results are sorted by timestamp ascending (chronological order).
6. Results are capped at a configurable limit (default 100, max 500) to prevent token budget blowout.
7. Includes ALL event types: errors, warnings, info logs, hot-reload markers, process exit events.
8. Each event includes its `signal_score` and `signal_strength` so the agent can filter by importance.

---

## Non-Functional Requirements

### NFR-1: Watch Latency

`watch_for_errors` must return within 200ms of the `duration_seconds` window expiring. The blocking mechanism must not introduce significant overhead beyond the requested duration.

### NFR-2: Token Efficiency

All Phase 2 tool responses must respect token budgets:
- `watch_for_errors`: max ~2,000 tokens for a typical response (5 errors).
- `get_build_errors`: max ~1,500 tokens for a typical response (5 build errors).
- `get_error_context`: max ~3,000 tokens (1 error + 50 surrounding logs).
- `get_timeline`: max ~5,000 tokens (100 events with truncated messages).

Messages are truncated to 500 chars, stack traces to 15 frames, raw lines to 1000 chars (per Phase 1 constants).

### NFR-3: No stdout Pollution

All Phase 2 code must respect the MCP protocol constraint: stdout is reserved for JSON-RPC messages. All diagnostic/debug output goes to stderr.

### NFR-4: Agent Compatibility

Phase 2 tools must work with any MCP-compatible agent (Kiro, Claude Code, Cursor, Copilot, Cline, Windsurf). No agent-specific code. Tool descriptions must be self-documenting so agents understand the edit → watch → verify workflow.

### NFR-5: Graceful Degradation

If the dev server process crashes during a `watch_for_errors` call, the tool must return immediately with collected errors and a process-exit event — not hang until the timeout.

### NFR-6: Concurrent Safety

Multiple MCP tool calls may be in flight simultaneously (e.g., `watch_for_errors` blocking while `get_runtime_status` is called). All Phase 2 tools must be safe for concurrent access to the shared event buffer.

### NFR-7: Build Error ANSI Handling

Build error parsers (TypeScript, ESLint, Vite/webpack) must handle ANSI-colored output. ANSI stripping from Phase 1 pipeline (NFR-3.5) applies to build error lines before they reach the parser. Parsers do not need to handle escape codes internally. _(Pitfall 4.4 from [Collector Pitfalls Guide](../../../docs/references/collector-pitfalls-hardening.md))_

---

## Out of Scope

1. **Multi-process / Docker Compose monitoring** — Phase 3 scope. Phase 2 assumes a single dev server process.
2. **Frontend-backend error correlation** — Phase 4 scope. No CDP/browser integration.
3. **Push notifications to the agent** — Phase 5 scope. Phase 2 is pull-only.
4. **Custom user-defined hot-reload patterns via config file** — The pattern registry is extensible programmatically, but config file support is deferred.
5. **Automatic early-return from `watch_for_errors` on hot-reload success** — Noted as future optimization. Initial implementation always waits the full duration.
6. **Streaming partial results during `watch_for_errors`** — The tool blocks and returns all results at once. SSE/streaming is not in scope.
7. **Persistent error history across restarts** — All state is in-memory per the architecture decision. Fingerprint persistence is Phase 3+.
8. **Windows-specific hot-reload patterns** — Linux/macOS first. Windows support is deferred.
