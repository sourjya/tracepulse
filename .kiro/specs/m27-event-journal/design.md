# M27 Event Journal — Design

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ Ring Buffer │────▶│ Event Journal    │────▶│ Telemetry Summary  │
│ (in-memory) │     │ (events.jsonl)   │     │ (telemetry.json)   │
└─────────────┘     └──────────────────┘     └────────────────────┘
       │                                             ▲
       │            ┌──────────────────┐             │
       └──────────▶│ Lifecycle FSM    │─────────────┘
                    │ (per-fingerprint)│
                    └──────────────────┘
```

## D1: Append-Only JSONL Event Journal

### File: `src/persistence/event-journal.ts`

**Schema:** One JSON object per line in `.tracepulse/events.jsonl`:

```typescript
interface JournalEntry {
  /** Entry type discriminator */
  readonly type: 'error' | 'lifecycle' | 'tool_call' | 'session_start' | 'session_end';
  /** Unix ms timestamp */
  readonly ts: number;
  /** Session ID (process start time as ISO string) */
  readonly sid: string;
  /** Payload varies by type */
  readonly data: ErrorEntry | LifecycleEntry | ToolCallEntry | SessionEntry;
}

interface ErrorEntry {
  readonly fingerprint: string;
  readonly level: string;
  /** Truncated to 200 chars */
  readonly message: string;
  readonly signal_score: number;
  readonly source: string;
  readonly service: string;
  readonly context?: { file?: string; line?: number; error_type?: string };
}

interface LifecycleEntry {
  readonly fingerprint: string;
  readonly from_state: LifecycleState;
  readonly to_state: LifecycleState;
  readonly trigger: string;
}

interface ToolCallEntry {
  readonly tool: string;
  readonly fingerprint?: string;
  /** Was this tool call related to investigating a specific error? */
  readonly investigating?: boolean;
}

interface SessionEntry {
  readonly agent?: { name: string; version?: string };
  readonly project_type?: string;
}
```

### Write strategy

- `fs.appendFileSync` for each entry (sync to guarantee ordering, < 0.1ms for a line)
- Newline-delimited JSON (JSONL) — one `JSON.stringify()` + `\n` per write
- File opened once at session start, closed on shutdown
- On startup: read existing journal, compact into `telemetry.json`, then truncate

### Size management

- Default max: 5MB (`MAX_JOURNAL_SIZE_BYTES`)
- On startup compaction: if journal > max, keep only last 24h of entries, compact rest into telemetry.json
- Constant: `MAX_JOURNAL_ENTRIES = 50000` as a secondary cap

### Compaction (on startup)

1. Read all lines from `events.jsonl`
2. Aggregate into `telemetry.json`: per-session summaries, fingerprint histories, episode durations
3. Truncate `events.jsonl` (start fresh for new session)
4. Existing `fingerprints.json` and `sessions.json` are read once (migration), then superseded by journal

## D4: Error Lifecycle State Machine

### File: `src/store/lifecycle-fsm.ts` (new, replaces logic in `error-lifecycle.ts`)

### States

```typescript
type LifecycleState =
  | 'first_seen'      // Error fingerprint appeared for the first time ever
  | 'surfaced'        // Error was returned to agent via get_errors/get_error_context
  | 'investigated'    // Agent called get_error_context or get_prompt_context for this fingerprint
  | 'edit_observed'   // A file change (HMR/save) was detected after investigation
  | 'suppressed'      // Error hasn't recurred after edit — default outcome (unconfirmed)
  | 'resolved'        // Same command re-exercised, error absent — confirmed fix
  | 'recurred';       // Error reappeared after suppressed/resolved
```

### Transitions

```
first_seen ──[agent calls get_errors containing this fp]──▶ surfaced
surfaced ──[agent calls get_error_context/get_prompt_context for this fp]──▶ investigated
investigated ──[file change detected (HMR/build)]──▶ edit_observed
edit_observed ──[RESOLUTION_WINDOW_MS elapsed, no recurrence]──▶ suppressed
suppressed ──[same command prefix re-ran, still absent]──▶ resolved
suppressed ──[fingerprint reappears]──▶ recurred
resolved ──[fingerprint reappears]──▶ recurred
recurred ──[agent calls get_errors containing this fp]──▶ surfaced (restart cycle)
```

### Implementation

```typescript
interface LifecycleFSM {
  /** Get current state for a fingerprint. Returns 'first_seen' if unknown. */
  getState(fingerprint: string): LifecycleState;
  /** Attempt a state transition. Returns true if transition was valid. */
  transition(fingerprint: string, trigger: LifecycleTrigger): boolean;
  /** Get all fingerprints in a given state. */
  inState(state: LifecycleState): string[];
  /** Get episode metrics for a fingerprint. */
  getEpisode(fingerprint: string): Episode | null;
  /** Export all states for journal persistence. */
  exportStates(): Map<string, LifecycleState>;
}

type LifecycleTrigger =
  | 'surfaced_to_agent'
  | 'investigated'
  | 'file_changed'
  | 'resolution_window_elapsed'
  | 're_exercised_absent'
  | 'recurred';

interface Episode {
  readonly fingerprint: string;
  readonly started_at: number;
  readonly ended_at?: number;
  readonly state: LifecycleState;
  readonly tool_calls: number;
  readonly outcome?: 'suppressed' | 'resolved' | 'recurred';
}
```

### Timer management

The `resolution_window_elapsed` trigger fires via `setTimeout(RESOLUTION_WINDOW_MS)` after entering `edit_observed`. If the fingerprint reappears before the timer fires, cancel it and transition to `recurred` instead.

## D16: Suppressed vs Resolved Semantics

### Integration with existing `acknowledge_error` tool

- `acknowledge_error` now transitions the fingerprint to `investigated` (was: removed from results)
- The MCP tool response includes the current lifecycle state

### Re-exercise detection

Track the "command prefix" from `run_and_watch` calls:
- When `run_and_watch("npx vitest run tests/auth.test.ts")` first surfaces an error
- If the same prefix (`npx vitest run tests/auth.test.ts`) is called again after `edit_observed`
- And the fingerprint does NOT appear in the new output
- Transition: `suppressed` → `resolved`

Store in: `commandPrefixByFingerprint: Map<string, string>`

### Metrics produced

```typescript
interface LifecycleMetrics {
  readonly suppressed_rate: number;        // fp reached suppressed / total fp surfaced
  readonly confirmed_fix_rate: number;     // fp reached resolved / total fp surfaced
  readonly recurrence_rate: number;        // fp reached recurred / (suppressed + resolved)
  readonly mean_time_to_suppress: number;  // ms from surfaced to suppressed (all)
  readonly mean_time_to_fix: number;       // ms from surfaced to resolved (confirmed only)
}
```

## Data Flow

1. **Error arrives in ring buffer** → journal appends `{ type: 'error', ... }`
2. **Agent calls `get_errors`** → for each returned fingerprint, FSM transitions `first_seen → surfaced`; journal appends lifecycle entry
3. **Agent calls `get_error_context(fp)`** → FSM transitions `surfaced → investigated`
4. **HMR detected** → FSM transitions `investigated → edit_observed`; starts resolution timer
5. **Timer fires (no recurrence)** → FSM transitions `edit_observed → suppressed`
6. **Same command re-exercised, fp absent** → FSM transitions `suppressed → resolved`
7. **Fingerprint reappears** → FSM transitions to `recurred`; episode ends; new episode starts on next `surfaced`

## Migration Path

- On first startup with new code: read `fingerprints.json` + `sessions.json` into new format
- Write entries as `{ type: 'session_start', data: { migrated: true } }` followed by fingerprint state entries
- After successful migration, existing files are kept (not deleted) but no longer read

## File Layout

```
src/persistence/
├── event-journal.ts        # NEW: append-only JSONL writer + startup compactor
├── journal-types.ts        # NEW: all journal entry type definitions
├── fingerprint-store.ts    # EXISTING: kept for backward compat migration
├── fingerprint-history.ts  # EXISTING: kept, now fed from journal on startup
└── session-store.ts        # EXISTING: kept for backward compat migration

src/store/
├── lifecycle-fsm.ts        # NEW: per-fingerprint state machine
├── error-lifecycle.ts      # EXISTING: simplified to delegate to FSM
├── ring-buffer.ts          # EXISTING: unchanged
└── ...
```
