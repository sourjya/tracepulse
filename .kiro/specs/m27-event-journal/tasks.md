# M27 Event Journal — Tasks

## Phase 1: Journal Types & Writer (D1)

- [ ] **1.1** Define journal entry types in `src/persistence/journal-types.ts`
  - RED: Test that JournalEntry discriminated union compiles and type-guards work
  - GREEN: Implement type definitions and guards
  - Deliverable: `src/persistence/journal-types.ts`, `tests/unit/persistence/journal-types.test.ts`

- [ ] **1.2** Implement append-only JSONL writer in `src/persistence/event-journal.ts`
  - RED: Test that `appendEntry()` writes valid JSONL to disk, each call = one line
  - RED: Test that concurrent appends are serialized (no interleaving)
  - RED: Test that entries survive SIGKILL (sync write)
  - GREEN: Implement writer with `fs.appendFileSync`
  - Deliverable: `src/persistence/event-journal.ts`, `tests/unit/persistence/event-journal.test.ts`

- [ ] **1.3** Implement startup compaction
  - RED: Test that on startup, existing journal lines are read and aggregated into telemetry.json
  - RED: Test that journal is truncated after compaction
  - RED: Test that journal > 5MB triggers size-based compaction (keep last 24h)
  - GREEN: Implement `compactJournal()` function
  - Deliverable: `tests/unit/persistence/event-journal-compaction.test.ts`

- [ ] **1.4** Wire journal into the pipeline
  - RED: Test that when ring buffer receives an event, journal gets an append
  - GREEN: Add journal hook to `process-line.ts` or ring buffer `push()`
  - Deliverable: Integration wiring in `src/pipeline/process-line.ts`

## Phase 2: Lifecycle State Machine (D4)

- [ ] **2.1** Implement FSM core in `src/store/lifecycle-fsm.ts`
  - RED: Test all valid state transitions (7 states, 7 triggers)
  - RED: Test that invalid transitions are rejected (return false)
  - RED: Test determinism — same event sequence always produces same final state
  - GREEN: Implement FSM with transition table
  - Deliverable: `src/store/lifecycle-fsm.ts`, `tests/unit/store/lifecycle-fsm.test.ts`

- [ ] **2.2** Implement episode tracking
  - RED: Test that episode starts on `first_seen → surfaced`
  - RED: Test that episode ends on transition to `suppressed`, `resolved`, or `recurred`
  - RED: Test that episode duration and tool_calls are tracked
  - GREEN: Add Episode tracking to FSM
  - Deliverable: Episode logic in `lifecycle-fsm.ts`

- [ ] **2.3** Implement resolution timer
  - RED: Test that `edit_observed` starts a timer for RESOLUTION_WINDOW_MS
  - RED: Test that timer fires → transitions to `suppressed`
  - RED: Test that recurrence before timer cancels it → transitions to `recurred`
  - GREEN: Implement with setTimeout + cancellation
  - Deliverable: Timer logic in `lifecycle-fsm.ts`, `tests/unit/store/lifecycle-fsm-timers.test.ts`

- [ ] **2.4** Wire FSM into MCP tool handlers
  - RED: Test that `get_errors` triggers `surfaced_to_agent` for returned fingerprints
  - RED: Test that `get_error_context` triggers `investigated`
  - RED: Test that `acknowledge_error` triggers `investigated`
  - GREEN: Add FSM calls to tool handlers in `src/mcp/server.ts`
  - Deliverable: Integration wiring

## Phase 3: Suppressed vs Resolved (D16)

- [ ] **3.1** Implement re-exercise detection
  - RED: Test that command prefix is stored when `run_and_watch` surfaces an error
  - RED: Test that same prefix re-run after `edit_observed` + no recurrence → `resolved`
  - RED: Test that different prefix doesn't trigger resolution
  - GREEN: Implement `commandPrefixByFingerprint` tracking
  - Deliverable: Re-exercise logic in `lifecycle-fsm.ts`

- [ ] **3.2** Implement lifecycle metrics
  - RED: Test `suppressed_rate` = count(suppressed) / count(surfaced)
  - RED: Test `confirmed_fix_rate` = count(resolved) / count(surfaced)
  - RED: Test `recurrence_rate` = count(recurred) / (count(suppressed) + count(resolved))
  - RED: Test `mean_time_to_fix` only uses resolved episodes
  - GREEN: Implement metrics computation
  - Deliverable: `src/store/lifecycle-metrics.ts`, `tests/unit/store/lifecycle-metrics.test.ts`

- [ ] **3.3** Expose metrics via MCP tool
  - RED: Test that `get_effectiveness_report` includes lifecycle metrics
  - GREEN: Add lifecycle metrics to effectiveness report response
  - Deliverable: Updated tool handler

## Phase 4: Integration & Migration

- [ ] **4.1** Migration from existing persistence files
  - RED: Test that existing `fingerprints.json` entries are loaded into FSM on startup
  - RED: Test that existing `sessions.json` entries are preserved
  - RED: Test that after migration, journal becomes the source of truth
  - GREEN: Implement migration logic in event-journal startup
  - Deliverable: Migration code in `event-journal.ts`

- [ ] **4.2** Journal entries for tool calls
  - RED: Test that `run_and_watch` calls are journaled with command prefix
  - RED: Test that `get_errors` calls are journaled
  - GREEN: Add journal hooks to audit-buffer or tool handlers
  - Deliverable: Tool call journaling

- [ ] **4.3** End-to-end integration test
  - RED: Full scenario: error arrives → agent queries → file change → timer → suppressed → re-exercise → resolved
  - GREEN: Wire everything together
  - Deliverable: `tests/integration/lifecycle-e2e.test.ts`

## Phase 5: Cleanup & Documentation

- [ ] **5.1** Update `error-lifecycle.ts` to delegate to FSM
  - Keep the public API (`filterActive`, `isLikelyResolved`) but backed by FSM
  - Backward compat for any consumers

- [ ] **5.2** Add constants to `src/constants/lifecycle.ts`
  - `RESOLUTION_WINDOW_MS`, `MAX_JOURNAL_SIZE_BYTES`, `MAX_JOURNAL_ENTRIES`

- [ ] **5.3** Update architecture guide
  - Document the event journal and lifecycle FSM in `docs/architecture/architecture-guide.md`

- [ ] **5.4** Changelog entry
