# Phase 5: Proactive Monitoring — Design

> **Hardening Reference:** See [Collector Pitfalls & Hardening Guide](../../../docs/references/collector-pitfalls-hardening.md) for known failure modes. Phase 5 git operations use `execFile` (not `exec`) to prevent shell injection (Pitfall 5.3). File paths are validated before passing to git commands.

## Architecture Overview

Phase 5 adds four subsystems on top of the existing TracePulse pipeline:

```
                                    ┌─────────────────────┐
                                    │   .tracepulse/      │
                                    │   fingerprints.json │
                                    └──────────┬──────────┘
                                               │ load on startup
                                               │ write on shutdown
                                               ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│ Event Buffer │───▶│  Severity    │───▶│  Fingerprint     │───▶│ MCP Tools    │
│ (Ring Buffer)│    │  Classifier  │    │  History Manager │    │              │
└──────────────┘    └──────────────┘    └──────┬───────────┘    │ get_new_errors│
                                               │                │ get_error_trends│
                                               │                │ correlate_with_diff│
                                    ┌──────────▼───────────┐    └──────┬───────┘
                                    │  Git Diff Correlator │           │
                                    │  (best-effort)       │◀──────────┘
                                    └──────────────────────┘

                    ┌──────────────────────────────────────┐
                    │  Notification Dispatcher (future)     │
                    │  - polls internally                   │
                    │  - emits MCP notification when ready  │
                    └──────────────────────────────────────┘

                    ┌──────────────────────────────────────┐
                    │  skills/                              │
                    │  ├── backend-error-triage.md          │
                    │  ├── edit-verify-loop.md              │
                    │  └── full-stack-debug.md              │
                    └──────────────────────────────────────┘
```

**Data flow:** Events enter the ring buffer → severity classifier tags each event → fingerprint history manager checks novelty → MCP tools query the enriched data. Git diff correlator runs on-demand when `correlate_with_diff()` is called.

---

## 1. Severity Classification

### Design

Severity is assigned during event ingestion, immediately after signal scoring. It is a new field on `RuntimeEvent`, not a replacement for `signal_score`/`signal_strength`.

```typescript
/**
 * Severity tiers for runtime events.
 * Ordered by impact: crash > error > warning > info.
 *
 * - crash: process-ending or unhandled — requires immediate attention
 * - error: caught but significant — likely needs a fix
 * - warning: non-fatal degradation — may need attention
 * - info: normal operational output — context only
 */
type Severity = "crash" | "error" | "warning" | "info";
```

### Classification Rules

The classifier runs a priority-ordered rule chain. First match wins:

| Priority | Condition | Severity | Signal Score Bonus |
|----------|-----------|----------|--------------------|
| 1 | Process exited with non-zero code | `crash` | +40 |
| 2 | Unhandled exception / uncaught rejection detected | `crash` | +40 |
| 3 | Signal: SIGKILL, SIGSEGV, SIGABRT | `crash` | +40 |
| 4 | HTTP 5xx status in message | `error` | +10 |
| 5 | Caught exception with stack trace | `error` | +10 |
| 6 | Log level is `error` | `error` | +10 |
| 7 | Deprecation notice pattern | `warning` | +5 |
| 8 | HTTP 4xx status in message | `warning` | +5 |
| 9 | Log level is `warn` | `warning` | +5 |
| 10 | Default (startup, config, info-level) | `info` | +0 |

### Integration with Signal Scoring

Severity classification runs after the existing signal scorer. The severity bonus is additive to the existing `signal_score`. The `signal_strength` tier is recalculated after the bonus is applied.

```
Event → Parser → Signal Scorer (base score) → Severity Classifier (adds bonus) → Final signal_strength
```

### Module Location

```
src/scoring/severity-classifier.ts   — classification logic (pure function)
src/types/events.ts                  — updated RuntimeEvent with severity field
```

---

## 2. Fingerprint History Manager

### Persistence Schema

`.tracepulse/fingerprints.json`:

```typescript
/**
 * Persisted fingerprint history.
 * Loaded on startup, updated on graceful shutdown.
 * Tracks per-fingerprint stats and per-session occurrence data.
 */
interface FingerprintHistory {
  /** Schema version for future migration detection. */
  readonly version: 1;
  /** Map of fingerprint hash → stats. */
  readonly fingerprints: Record<string, FingerprintRecord>;
  /** Ordered list of recent sessions (newest last). Capped at 50. */
  readonly sessions: SessionRecord[];
}

interface FingerprintRecord {
  /** Unix ms — first time this fingerprint was ever seen. */
  readonly first_seen: number;
  /** Unix ms — most recent occurrence. */
  readonly last_seen: number;
  /** Cumulative count across all sessions. */
  readonly total_occurrences: number;
  /** Number of distinct sessions this fingerprint appeared in. */
  readonly session_count: number;
  /** IDs of sessions where this fingerprint appeared. */
  readonly session_ids: string[];
}

interface SessionRecord {
  /** Unique session ID (UUID, generated on TracePulse start). */
  readonly session_id: string;
  /** Unix ms — when this session started. */
  readonly started_at: number;
  /** Fingerprints seen during this session. */
  readonly fingerprints_seen: string[];
}
```

### Lifecycle

1. **Startup:** Load `fingerprints.json`. If missing or corrupt, start with empty history and log warning to stderr.
2. **Runtime:** Track new fingerprints in memory. Each event's fingerprint is checked against the in-memory `Set<string>` for O(1) novelty detection.
3. **Shutdown (SIGINT/SIGTERM):** Merge current session data into history. Write atomically (temp file + rename). Prune sessions beyond the 50-session cap.

### Atomic Write Strategy

```
1. JSON.stringify(history) → write to .tracepulse/fingerprints.tmp
2. fs.rename(.tracepulse/fingerprints.tmp, .tracepulse/fingerprints.json)
```

`fs.rename` is atomic on POSIX systems. If the process crashes mid-write, the original file is preserved.

### Module Location

```
src/persistence/fingerprint-history.ts  — load, save, query, merge logic
src/constants/persistence.ts            — file paths, caps, defaults
```

---

## 3. Git Diff Correlator

### Design

The correlator is a stateless, on-demand module. It runs `git diff HEAD` via `node:child_process`, parses the output, and matches changed files against error `context.file` fields.

### Correlation Algorithm

```
1. Run `git diff HEAD --name-only` → list of changed files
2. For each error with context.file:
   a. Normalize both paths (resolve relative, strip leading ./)
   b. Check if error file is in the changed files list
   c. If match: run `git diff HEAD -- <file>` to get line-level diff
   d. Parse diff hunks to find line ranges near error context.line
   e. Generate diff_summary from hunk headers and +/- line counts
3. Return matched pairs sorted by error signal_score (highest first)
```

### Line Range Matching

A diff hunk is considered "near" an error line if the hunk's range overlaps with `[error.line - 10, error.line + 10]`. This 10-line proximity window accounts for line shifts caused by insertions/deletions above the error location.

### Git Command Execution

> **Security:** Uses `node:child_process.execFile` (not `exec`) to prevent shell injection. The git binary path is resolved directly, not passed through a shell. File paths from error context are validated before being passed as git arguments — no path traversal (`../`), no null bytes. _(Pitfall 5.3 from [Collector Pitfalls Guide](../../../docs/references/collector-pitfalls-hardening.md))_

```typescript
/**
 * Execute a git command with timeout protection.
 * Uses execFile (not exec) to prevent shell injection.
 * All git commands use a 5-second timeout to prevent hanging on large repos.
 * Returns stdout as a string, or null if git is not available / command fails.
 */
function execGit(args: string[], cwd: string): Promise<string | null>;
```

- Timeout: 5 seconds per command.
- If `git` is not on PATH or the directory is not a git repo, return `null` (not an error).
- The correlator detects the git root via `git rev-parse --show-toplevel`.

### Diff Summary Generation

For each matched file, the summary is built from the diff hunk header:

```
"@@ -42,7 +42,12 @@ function handleAuth()" → "+5 -0 lines in handleAuth()"
```

Truncated to 200 characters.

### Module Location

```
src/correlation/git-diff-correlator.ts  — diff parsing, file matching, summary generation
src/constants/correlation.ts            — timeout, proximity window, summary max length
```

---

## 4. MCP Tool Contracts

### `get_new_errors`

```typescript
/**
 * Returns only errors with fingerprints not seen in previous sessions.
 *
 * @param since_session_start - If true, only check errors that appeared
 *   after the current session started. Default: false (check all in buffer).
 * @param severity - Optional filter by severity tier.
 * @param limit - Max events to return. Default: 10.
 * @returns RuntimeEvent[] — only events with novel fingerprints.
 */
interface GetNewErrorsParams {
  readonly since_session_start?: boolean;
  readonly severity?: Severity;
  readonly limit?: number;
}
```

**Response:** Standard `RuntimeEvent[]` with the added `severity` field.

### `get_error_trends`

```typescript
/**
 * Returns frequency and recurrence data for a specific error fingerprint.
 *
 * @param fingerprint - The fingerprint hash to look up.
 * @returns Trend data including cross-session frequency.
 */
interface GetErrorTrendsParams {
  readonly fingerprint: string;
}

interface ErrorTrendResponse {
  readonly fingerprint: string;
  readonly first_seen: number;
  readonly last_seen: number;
  readonly total_occurrences: number;
  readonly session_count: number;
  readonly recent_sessions: {
    readonly appeared_in: number;
    readonly out_of: number;
  };
}
```

### `correlate_with_diff`

```typescript
/**
 * Matches current errors against recent git changes.
 * Best-effort: matches file paths, not semantic causation.
 *
 * @returns Array of error-to-diff correlations, sorted by signal_score descending.
 */
interface DiffCorrelation {
  readonly error: RuntimeEvent;
  readonly likely_cause: {
    readonly file: string;
    readonly line_range: [number, number];
    readonly diff_summary: string;
  };
}
```

**Response:** `DiffCorrelation[]`. Empty array if no git repo or no matches.

---

## 5. Notification Architecture

### Current State (Polling Fallback)

The MCP protocol (as of `@modelcontextprotocol/sdk` v1.12.x) does not support server-initiated notifications to the client. Phase 5 implements the polling fallback:

```
Agent workflow:
  1. Agent calls get_new_errors() periodically (e.g., after each edit)
  2. TracePulse checks ring buffer against fingerprint history
  3. Returns only novel, high-signal errors
```

### Future State (Server Push)

When MCP adds server-initiated notifications:

```
TracePulse workflow:
  1. New event enters ring buffer
  2. Severity classifier tags it
  3. Fingerprint history check: is it new?
  4. If new AND signal_strength === 'high':
     → Emit MCP notification: notifications/tracepulse/new_error
  5. Deduplicate: same fingerprint only notified once per session
```

### Notification Payload (Designed Now, Wired Later)

```typescript
/**
 * Token-efficient notification payload.
 * Designed for < 200 tokens. Full RuntimeEvent available via get_error_context.
 */
interface ErrorNotificationPayload {
  readonly fingerprint: string;
  readonly severity: Severity;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly signal_score: number;
}
```

### Feature Flag

Notifications are gated behind `TRACEPULSE_NOTIFICATIONS=true` environment variable. When the flag is off (default), the notification dispatcher is not instantiated.

### Module Location

```
src/notifications/notification-dispatcher.ts  — internal event listener, dedup, payload construction
src/constants/notifications.ts                — feature flag name, payload limits
```

---

## 6. Skills System

### Directory Structure

```
skills/
├── backend-error-triage.md
├── edit-verify-loop.md
└── full-stack-debug.md
```

Skills are shipped as static markdown files in the npm package. They are not executable — agents read them as documentation.

### Skill File Format

Each skill follows a consistent structure:

```markdown
# Skill: <Name>

## When to Use
<One-paragraph description of the scenario this skill addresses.>

## Prerequisites
<MCP servers and tools that must be available.>

## Steps

### Step 1: <Action>
**Tool call:** `<tool_name>(<params>)`
**Expected output:** <What the agent should see.>
**Decision:** <If X, go to Step N. If Y, go to Step M.>

### Step 2: ...

## Common Pitfalls
<What can go wrong and how to recover.>
```

### Skill Summaries

**backend-error-triage.md:**
1. `get_runtime_status()` — check if server is running
2. `get_new_errors(limit=5)` — get recent novel errors
3. For each high-signal error: `get_error_context(fingerprint)` — get full stack trace
4. Read source file at `file:line` — understand the code
5. `get_error_trends(fingerprint)` — check if this is chronic
6. `correlate_with_diff()` — check if a recent change caused it
7. Propose fix based on evidence

**edit-verify-loop.md:**
1. Agent edits code
2. `watch_for_errors(15)` — wait for hot-reload
3. If errors: `get_error_context(fingerprint)` — understand what broke
4. Fix and repeat from step 1
5. If clean: `get_new_errors(since_session_start=true)` — confirm no regressions
6. Done

**full-stack-debug.md:**
1. `get_errors(limit=5)` — check backend
2. Chrome DevTools MCP: `list_console_messages` — check browser console
3. Chrome DevTools MCP: `list_network_requests` — check network
4. Correlate by timestamp and URL — identify which layer failed
5. `correlate_with_diff()` — link to recent changes
6. Fix the root cause layer first

---

## 7. Updated RuntimeEvent Schema

```typescript
/**
 * A single runtime event captured from the dev server's output.
 *
 * Phase 5 additions: severity field and updated signal_score calculation
 * that incorporates severity bonus.
 */
interface RuntimeEvent {
  readonly id: string;
  readonly timestamp: number;
  readonly source: "server-stdout" | "server-stderr" | "build-error" | "docker-log";
  readonly service: string;
  readonly level: "error" | "warn" | "info" | "debug";
  readonly message: string;
  readonly stack_trace?: string;
  readonly fingerprint: string;
  readonly signal_score: number;
  readonly signal_strength: "high" | "medium" | "low";
  /** Phase 5: auto-classified severity tier. */
  readonly severity: Severity;
  readonly context: {
    readonly file?: string;
    readonly line?: number;
    readonly column?: number;
    readonly framework?: string;
    readonly error_type?: string;
    readonly trace_id?: string;
  };
  readonly raw: string;
  readonly first_seen: number;
  readonly occurrence_count: number;
}
```

---

## 8. File Layout (Phase 5 Additions)

```
src/
├── scoring/
│   └── severity-classifier.ts       — severity classification logic
├── persistence/
│   └── fingerprint-history.ts       — load, save, query fingerprint history
├── correlation/
│   └── git-diff-correlator.ts       — git diff parsing and file matching
├── notifications/
│   └── notification-dispatcher.ts   — notification payload + dedup (future wiring)
├── tools/
│   ├── get-new-errors.ts            — MCP tool handler
│   ├── get-error-trends.ts          — MCP tool handler
│   └── correlate-with-diff.ts       — MCP tool handler
├── constants/
│   ├── persistence.ts               — fingerprint file paths, session cap
│   ├── correlation.ts               — git timeout, proximity window
│   └── notifications.ts             — feature flag, payload limits
└── types/
    └── events.ts                    — updated with Severity type

skills/
├── backend-error-triage.md
├── edit-verify-loop.md
└── full-stack-debug.md
```
