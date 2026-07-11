# M27 Event Journal + Lifecycle State Machine

**Ticket:** TRP-10
**Milestone:** M27 (Effectiveness Telemetry)
**Priority:** P0 — Foundation for all other M27 features

## User Stories

### US-1: Crash-proof event recording
As a developer using TracePulse, I want all error events written to disk immediately so that crash sessions (the worst sessions) are never lost from telemetry.

**Acceptance criteria:**
- Events are appended to `.tracepulse/events.jsonl` within 100ms of occurrence
- If the process crashes, all events up to the last flush are recoverable
- On next startup, the journal is compacted into `telemetry.json` (aggregated metrics)
- Journal file is size-capped (configurable, default 5MB) with rotation

### US-2: Error lifecycle tracking
As a developer, I want TracePulse to know whether an error was actually fixed (confirmed absent after re-exercise) vs simply stopped appearing (suppressed), so that metrics are honest.

**Acceptance criteria:**
- Each fingerprint has an explicit lifecycle state: `first_seen`, `surfaced`, `investigated`, `edit_observed`, `suppressed`, `resolved`, `recurred`
- State transitions are triggered by observable events (tool calls, file changes, command re-runs)
- The state machine is deterministic — same event sequence always produces same state
- States are persisted in the event journal (survive crashes)

### US-3: Suppressed vs resolved distinction
As a developer reading effectiveness reports, I want `fix_rate` split into `suppressed_rate` and `confirmed_fix_rate` so I can trust the numbers.

**Acceptance criteria:**
- Default outcome is `suppressed` (fingerprint absent, unconfirmed)
- `resolved` requires re-exercise evidence: same command prefix ran again with no recurrence
- `recurred` is set when a previously suppressed/resolved fingerprint reappears
- `mean_time_to_fix` computed on confirmed fixes only
- API surfaces all three rates separately

### US-4: Investigation episode segmentation
As TracePulse (for internal metrics), I want to segment each error's lifecycle into "investigation episodes" so I can measure how long each error takes to resolve.

**Acceptance criteria:**
- An episode starts when a fingerprint is first surfaced to the agent
- An episode ends when the fingerprint transitions to `suppressed` or `resolved`
- Episode duration, tool calls during episode, and outcome are recorded
- Episodes are queryable for cross-session pattern analysis

## Non-Functional Requirements

- **Performance:** Journal append must not block the main event loop (< 1ms p99)
- **Disk usage:** Default cap 5MB per journal file, rotated on startup compaction
- **Backward compatibility:** Existing `.tracepulse/fingerprints.json` and `sessions.json` still loaded on startup (migration path)
- **Security:** No raw error messages > 200 chars in journal; fingerprints are hashes only
- **Crash safety:** Uses `fs.appendFileSync` or write-ahead pattern — no data loss on SIGKILL

## Out of Scope

- OTLP receiver (TRP-9)
- Per-agent stratification (TRP-11)
- Score calibration metrics (TRP-20)
- Cross-session recurrence tracking beyond what the state machine provides (TRP-15)
