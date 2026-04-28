# Phase 5: Proactive Monitoring — Requirements

## Overview

Phase 5 shifts TracePulse from a pull model (agent queries for errors) to a push model (agent gets notified of new, unseen errors). It adds new-fingerprint detection, git diff correlation, severity classification, error frequency tracking, and agent skill files that teach structured debugging workflows.

**Prerequisite:** Phase 4 (Frontend-Backend Correlation) complete.

---

## User Stories

### US-1: New-Fingerprint Detection

**As** an AI coding agent,
**I want** to retrieve only errors whose fingerprints have never been seen in previous sessions,
**so that** I focus on genuinely new problems instead of re-investigating known issues.

**Acceptance Criteria:**
1. `get_new_errors()` returns only `RuntimeEvent[]` whose fingerprints are absent from `.tracepulse/fingerprints.json`.
2. `get_new_errors(since_session_start=true)` scopes the check to errors that appeared after the current session started.
3. When `since_session_start` is omitted or `false`, all events in the ring buffer are checked against the full fingerprint history.
4. Fingerprint history is loaded from `.tracepulse/fingerprints.json` on startup and updated on graceful shutdown (`SIGINT`/`SIGTERM`).
5. If `.tracepulse/fingerprints.json` does not exist, all current errors are treated as new.
6. Response includes the same `signal_score` and `signal_strength` fields as `get_errors`.

### US-2: Error Frequency Trends

**As** an AI coding agent,
**I want** to query how often a specific error has appeared across sessions,
**so that** I can distinguish chronic bugs from one-off failures and prioritize accordingly.

**Acceptance Criteria:**
1. `get_error_trends(fingerprint)` returns `{ first_seen: number, session_count: number, total_occurrences: number, last_seen: number }`.
2. `first_seen` and `last_seen` are Unix millisecond timestamps.
3. `session_count` is the number of distinct sessions in which this fingerprint appeared.
4. `total_occurrences` is the cumulative count across all sessions.
5. If the fingerprint is unknown, the tool returns an error with a clear message: `"Unknown fingerprint: <value>"`.
6. Trend data is persisted in `.tracepulse/fingerprints.json` alongside the fingerprint history.

### US-3: Git Diff Correlation

**As** an AI coding agent,
**I want** to see which recent code changes likely caused each new error,
**so that** I can jump directly to the relevant diff instead of searching the whole codebase.

**Acceptance Criteria:**
1. `correlate_with_diff()` returns `{ error: RuntimeEvent, likely_cause: { file: string, line_range: [number, number], diff_summary: string } }[]`.
2. Correlation matches the `context.file` field of each error against files changed in `git diff HEAD`.
3. `line_range` is the range of changed lines in the diff that overlap with or are near the error's `context.line`.
4. `diff_summary` is a human-readable summary of the change (e.g., `"+15 -3 lines in handleAuth()"`) truncated to 200 characters.
5. If no git repository is detected, the tool returns an empty array with a warning message.
6. If an error has no `context.file`, it is excluded from correlation results.
7. Correlation is best-effort — the tool matches file paths, not semantic causation.

### US-4: Severity Classification

**As** an AI coding agent,
**I want** every runtime event auto-classified into a severity tier (crash, error, warning, info),
**so that** I can triage issues by impact without reading every log line.

**Acceptance Criteria:**
1. Every `RuntimeEvent` includes a `severity` field with one of: `crash`, `error`, `warning`, `info`.
2. `crash` is assigned when: unhandled exception detected, process exit with non-zero code, or `SIGKILL`/`SIGSEGV` signal.
3. `error` is assigned when: caught exception logged, HTTP 5xx status, or explicit error-level log.
4. `warning` is assigned when: deprecation notice, non-fatal warning, or HTTP 4xx status.
5. `info` is assigned when: startup message, configuration log, or informational output.
6. Severity classification integrates with the existing `signal_score` system — `crash` adds +40, `error` adds +10, `warning` adds +5, `info` adds +0.
7. Existing MCP tools (`get_errors`, `get_new_errors`) accept an optional `severity` filter parameter.

### US-5: MCP Notifications (Polling Fallback)

**As** an AI coding agent,
**I want** to be notified when a new high-signal error appears without having to poll continuously,
**so that** I can react to errors as they happen during long-running development sessions.

**Acceptance Criteria:**
1. When the MCP protocol supports server-initiated notifications, TracePulse pushes `notifications/tracepulse/new_error` with the `RuntimeEvent` payload for errors with `signal_strength === 'high'` and a new fingerprint.
2. Until server-initiated notifications are available, `get_new_errors` serves as the polling fallback — agents call it periodically.
3. The notification mechanism is behind a feature flag (`TRACEPULSE_NOTIFICATIONS=true` in environment) so it can be enabled when protocol support lands.
4. Notifications are deduplicated — the same fingerprint is only pushed once per session.
5. The notification payload is token-efficient: `{ fingerprint, severity, message, file, line, signal_score }` — not the full `RuntimeEvent`.

### US-6: Error Frequency Stats Across Sessions

**As** an AI coding agent,
**I want** to know that "this error appeared in 5 of your last 8 sessions,"
**so that** I can identify persistent issues that need architectural fixes rather than quick patches.

**Acceptance Criteria:**
1. Fingerprint history tracks per-session occurrence: `{ sessions: [{ session_id, timestamp, count }] }`.
2. `get_error_trends` includes a `recent_sessions` field: `{ appeared_in: number, out_of: number }` for the last N sessions (N defaults to 10, configurable).
3. Session boundaries are defined by TracePulse process start/stop — each `tracepulse start` is a new session.
4. Session history is capped at 50 sessions to bound storage.
5. Old sessions beyond the cap are pruned on startup (FIFO).

### US-7: Agent Skills / Recipes

**As** an AI coding agent,
**I want** structured debugging workflow recipes shipped with TracePulse,
**so that** I know exactly which tools to call in which order for common debugging scenarios.

**Acceptance Criteria:**
1. TracePulse ships with at least 3 skill files in a `skills/` directory at the package root.
2. Required skills: `backend-error-triage.md`, `edit-verify-loop.md`, `full-stack-debug.md`.
3. Each skill file contains: a title, a description of when to use it, numbered steps with exact MCP tool calls, decision trees for branching logic, and expected outputs at each step.
4. `full-stack-debug.md` references Chrome DevTools MCP tools for the browser verification step.
5. Skills are included in the npm package (`"files": ["dist", "skills"]` in package.json — already configured).
6. Skills use no TracePulse-internal jargon — they are readable by any MCP-compatible agent.

---

## Non-Functional Requirements

### NFR-1: Fingerprint History Performance
- Loading `.tracepulse/fingerprints.json` must complete in < 100ms for files up to 1MB.
- Fingerprint lookup (is-this-new?) must be O(1) — use a `Set` or `Map` in memory.

### NFR-2: Git Diff Latency
- `correlate_with_diff()` must complete in < 2 seconds for repositories with up to 500 changed files.
- Git operations use `node:child_process.execFile` (not `exec`) to prevent shell injection. File paths from error context are validated before being passed as git arguments. _(Pitfall 5.3 from [Collector Pitfalls Guide](../../../docs/references/collector-pitfalls-hardening.md))_
- Git operations have a 5-second timeout.

### NFR-3: Persistence Durability
- Fingerprint history is written atomically (write to temp file, then rename) to prevent corruption on crash.
- If the file is corrupted on load, TracePulse logs a warning to stderr and starts with an empty history.

### NFR-4: Token Efficiency
- `get_new_errors` response is capped at 10 events by default (configurable via `limit` parameter).
- `get_error_trends` response is < 500 tokens for a single fingerprint.
- Notification payloads are < 200 tokens each.

### NFR-5: Backward Compatibility
- Phase 5 additions do not break existing Phase 1–4 MCP tool contracts.
- The `severity` field is additive — existing `RuntimeEvent` consumers that don't read it are unaffected.

### NFR-6: Zero Config
- All Phase 5 features work without a config file.
- Fingerprint history auto-creates `.tracepulse/` directory if missing.
- Git diff correlation auto-detects the git root; no configuration needed.

---

## Out of Scope

1. **Server-initiated MCP notifications implementation** — the protocol doesn't support this yet. We implement the polling fallback and the notification payload design. Actual push is deferred until MCP SDK adds support.
2. **Semantic diff analysis** — `correlate_with_diff` matches file paths, not AST-level causation. No "this function call changed" analysis.
3. **Cross-repository correlation** — git diff is scoped to the current repository only.
4. **Skill execution engine** — skills are documentation files, not executable workflows. The agent reads and follows them; TracePulse does not orchestrate skill steps.
5. **Custom user-defined skills** — only the 3 built-in skills ship in Phase 5. User-extensible skills are a future enhancement.
6. **Fingerprint history migration** — if the schema of `fingerprints.json` changes between versions, no automatic migration is provided. The file is reset.
7. **Real-time streaming of errors** — Phase 5 uses polling (`get_new_errors`), not WebSocket/SSE streaming.
