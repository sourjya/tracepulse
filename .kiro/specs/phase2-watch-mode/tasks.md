# Implementation Plan: Phase 2 — Watch Mode

## Overview

Phase 2 closes the agent's edit → verify feedback loop with four new MCP tools: `watch_for_errors`, `get_build_errors`, `get_error_context`, and `get_timeline`. It also adds hot-reload detection and build error parsing.

**Architecture References:**
- `docs/ideas/feature-architecture-analysis.md` — Decisions 6 (pull-first) and 7 (signal scoring)
- `.kiro/specs/phase2-watch-mode/requirements.md` — US-1 through US-6
- `.kiro/specs/phase2-watch-mode/design.md` — Component interactions, tool contracts

**Key Principles:**
- Phase 1 must be complete before starting Phase 2
- All new modules follow the Phase 1 parser interface pattern
- stdout is reserved for MCP JSON-RPC — all diagnostics to stderr
- Every RuntimeEvent includes signal_score and signal_strength

**Development Approach - TDD MANDATORY:**
- **RED -> GREEN -> REFACTOR**: Write failing tests FIRST, then minimal implementation, then refactor
- NEVER write implementation code before its test
- Each phase below follows strict TDD ordering: tests before implementation
- See testing-standards.md for complete TDD guidelines

**Testing Strategy:**
- Unit tests for parsers, hot-reload detector, watch controller, timeline query
- Integration tests for MCP tool handlers with a real event buffer
- All tests use vitest

## Tasks

### Phase 1: Constants & Event Buffer Subscription

#### Step 1: Watch Mode Constants — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 1.1 Write unit tests for watch mode constants
  - Test that all constants are exported and have expected values
  - Test that MIN < DEFAULT < MAX for watch duration
  - Test that signal score constants are within 0-100 range
  - File: `tests/unit/constants/watch.test.ts`
  - _Requirements: design.md constants section_

**GREEN Phase: Implement to Pass Tests**
- [ ] 1.2 Implement watch mode constants
  - Create `src/constants/watch.ts` with all Phase 2 constants
  - Export: DEFAULT_WATCH_DURATION_SECONDS, MIN/MAX_WATCH_DURATION_SECONDS, ERROR_CONTEXT_WINDOW_MS, MAX_SURROUNDING_LOGS, DEFAULT_TIMELINE_LIMIT, MAX_TIMELINE_LIMIT, DEFAULT_BUILD_ERRORS_LIMIT, MAX_BUILD_ERRORS_LIMIT, HOT_RELOAD_SIGNAL_SCORE, BUILD_ERROR_BASE_SIGNAL_SCORE
  - Add comprehensive documentation per commenting standards
  - _Requirements: design.md constants section_

#### Step 2: Event Buffer Subscription — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 2.1 Write unit tests for event buffer subscription
  - Test subscribe returns an unsubscribe function
  - Test subscriber receives new events on add()
  - Test unsubscribe stops event delivery
  - Test multiple subscribers receive the same event
  - Test subscriber errors don't break other subscribers or the buffer
  - File: `tests/unit/buffer/event-buffer-subscription.test.ts`
  - _Requirements: US-1 (watch_for_errors needs real-time event delivery)_

**GREEN Phase: Implement to Pass Tests**
- [ ] 2.2 Extend event buffer with subscription capability
  - Add `subscribe(callback)` method to the existing event buffer
  - Return unsubscribe function from subscribe
  - Emit events synchronously on `add()`
  - Wrap subscriber callbacks in try/catch to isolate failures
  - File: extend existing `src/buffer/` module
  - _Requirements: US-1_

**REFACTOR Phase: Clean Up**
- [ ] 2.3 Refactor event buffer subscription (if needed)
  - Ensure subscription API is consistent with existing buffer interface
  - Verify no performance regression on add() with zero subscribers

#### Checkpoint: Phase 1 Complete

- [ ] All tests passing (`npm run test`)
- [ ] No linting errors (`npm run lint`)
- [ ] No type errors (`npm run typecheck`)
- [ ] Constants are importable and documented
- [ ] Event buffer subscription works with existing Phase 1 buffer
- [ ] Changelog updated

---

### Phase 2: Hot-Reload Detection

#### Step 3: Hot-Reload Patterns — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 3.1 Write unit tests for hot-reload patterns
  - Test each default pattern matches its expected output (Vite, webpack, nodemon, Next.js, ts-node-dev)
  - Test patterns do NOT match unrelated log lines
  - Test pattern registry is iterable
  - Test each pattern has required fields (id, tool, pattern, description)
  - File: `tests/unit/watch/hot-reload-patterns.test.ts`
  - _Requirements: US-2 AC-1, AC-2_

**GREEN Phase: Implement to Pass Tests**
- [ ] 3.2 Implement hot-reload pattern registry
  - Create `src/watch/hot-reload-patterns.ts` with HotReloadPattern interface and DEFAULT_PATTERNS array
  - Include patterns for: vite-compiled, vite-hmr, webpack-compiled, nodemon-restart, nodemon-starting, nextjs-compiled, nextjs-compiling, tsnode-restart
  - Document each pattern with the tool it detects and example match
  - _Requirements: US-2 AC-1, AC-2, AC-5_

#### Step 4: Hot-Reload Detector — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 4.1 Write unit tests for hot-reload detector
  - Test detector matches a Vite compilation success line and produces a synthetic RuntimeEvent
  - Test detector matches a nodemon restart line
  - Test detector ignores non-matching lines
  - Test synthetic event has correct fields: level=info, source=server-stdout, signal_score=5, signal_strength=low
  - Test synthetic event fingerprint follows hotreload:{pattern.id} format
  - Test detector works with custom patterns added to registry
  - File: `tests/unit/watch/hot-reload-detector.test.ts`
  - _Requirements: US-2 AC-3, AC-4, AC-5_

**GREEN Phase: Implement to Pass Tests**
- [ ] 4.2 Implement hot-reload detector
  - Create `src/watch/hot-reload-detector.ts`
  - Implement `detectHotReload(line: string, patterns?: HotReloadPattern[]): RuntimeEvent | null`
  - Use default patterns when none provided
  - Generate synthetic RuntimeEvent with correct signal scoring
  - Create `src/watch/index.ts` re-exporting public API
  - _Requirements: US-2_

**REFACTOR Phase: Clean Up**
- [ ] 4.3 Refactor hot-reload detection (if needed)
  - Ensure pattern matching is efficient (compiled regexes, early exit)
  - Verify all tests still pass

#### Checkpoint: Phase 2 Complete

- [ ] All tests passing
- [ ] Hot-reload detector correctly identifies all 5 dev tools
- [ ] Synthetic events have correct signal scoring
- [ ] No linting or type errors
- [ ] Changelog updated

---

### Phase 3: Build Error Parsers

#### Step 5: TypeScript Compiler Parser — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 5.1 Write unit tests for TypeScript compiler parser
  - Test single-line TS error: `src/auth.ts(42,5): error TS2345: ...` → RuntimeEvent with file, line, column, error_type
  - Test multi-line TS error (type mismatch with expected/received) grouped into single event
  - Test TS warning vs error distinction
  - Test source is 'build-error' and signal_score >= 50
  - Test non-TS lines return null
  - File: `tests/unit/parsers/build/typescript-parser.test.ts`
  - _Requirements: US-3 AC-1, AC-4, AC-5, AC-6_

**GREEN Phase: Implement to Pass Tests**
- [ ] 5.2 Implement TypeScript compiler parser
  - Create `src/parsers/build/typescript-parser.ts`
  - Implement parser following Phase 1 parser interface
  - Handle single-line and multi-line error grouping
  - Set source='build-error', signal_score based on BUILD_ERROR_BASE_SIGNAL_SCORE + additive factors
  - _Requirements: US-3 AC-1_

#### Step 6: ESLint Parser — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 6.1 Write unit tests for ESLint parser
  - Test ESLint error line with file header: `/path/file.ts` followed by `  10:5  error  message  rule-name`
  - Test ESLint warning line
  - Test multiple errors under same file header
  - Test source is 'build-error' and context includes rule name as error_type
  - Test non-ESLint lines return null
  - File: `tests/unit/parsers/build/eslint-parser.test.ts`
  - _Requirements: US-3 AC-2, AC-4, AC-5_

**GREEN Phase: Implement to Pass Tests**
- [ ] 6.2 Implement ESLint parser
  - Create `src/parsers/build/eslint-parser.ts`
  - Implement parser following Phase 1 parser interface
  - Handle file header + indented error lines pattern
  - Set source='build-error' with appropriate signal scoring
  - _Requirements: US-3 AC-2_

#### Step 7: Vite/webpack Build Error Parser — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 7.1 Write unit tests for Vite/webpack build error parser
  - Test Vite internal server error: `[vite] Internal server error: Failed to resolve import...`
  - Test webpack module not found: `ERROR in ./src/App.tsx Module not found...`
  - Test Vite transform error with file path extraction
  - Test source is 'build-error' and signal_score >= 50
  - Test non-build-error lines return null
  - File: `tests/unit/parsers/build/vite-webpack-parser.test.ts`
  - _Requirements: US-3 AC-3, AC-4, AC-5_

**GREEN Phase: Implement to Pass Tests**
- [ ] 7.2 Implement Vite/webpack build error parser
  - Create `src/parsers/build/vite-webpack-parser.ts`
  - Implement parser following Phase 1 parser interface
  - Handle Vite and webpack error formats
  - Create `src/parsers/build/index.ts` re-exporting all build parsers
  - _Requirements: US-3 AC-3_

**REFACTOR Phase: Clean Up**
- [ ] 7.3 Refactor build parsers (if needed)
  - Extract shared patterns across build parsers if any emerge
  - Ensure all parsers are registered in the Phase 1 parser registry
  - Verify all tests still pass

#### Checkpoint: Phase 3 Complete

- [ ] All tests passing
- [ ] All three build parsers produce correct RuntimeEvent objects
- [ ] Build errors have source='build-error' and signal_score >= 50
- [ ] Parsers registered in the parser registry
- [ ] No linting or type errors
- [ ] Changelog updated

---

### Phase 4: Watch Controller & Timeline Query

#### Step 8: Timeline Query — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 8.1 Write unit tests for timeline query
  - Test query returns events within time range [since, since + duration]
  - Test query with no duration returns events from since to now
  - Test results are sorted by timestamp ascending
  - Test results are capped at limit
  - Test empty buffer returns empty array
  - Test query with since in the future returns empty array
  - Test surrounding logs query (±window_ms, excluding target event)
  - Test surrounding logs capped at MAX_SURROUNDING_LOGS
  - File: `tests/unit/query/timeline-query.test.ts`
  - _Requirements: US-5 AC-3 through AC-8, US-6 AC-1 through AC-6_

**GREEN Phase: Implement to Pass Tests**
- [ ] 8.2 Implement timeline query module
  - Create `src/query/timeline-query.ts`
  - Implement `queryTimeline(buffer, since, durationSeconds?, limit?)` → RuntimeEvent[]
  - Implement `querySurroundingLogs(buffer, targetEvent, windowMs, maxResults)` → RuntimeEvent[]
  - Implement `countOccurrences(buffer, fingerprint)` → number
  - Create `src/query/index.ts` re-exporting public API
  - _Requirements: US-5, US-6_

#### Step 9: Watch Controller — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 9.1 Write unit tests for watch controller
  - Test watch collects events that arrive after start (using fake timers)
  - Test watch ignores events that existed before start
  - Test watch respects duration_seconds timeout
  - Test watch filters by source when provided
  - Test watch only collects error and warn level events
  - Test watch returns empty array when no errors during window
  - Test watch deduplicates by fingerprint (keeps latest, counts occurrences)
  - Test watch returns immediately on process-exit event
  - Test validation: duration_seconds outside 1-120 throws
  - Test multiple concurrent watches are independent
  - File: `tests/unit/watch/watch-controller.test.ts`
  - _Requirements: US-1 AC-1 through AC-8_

**GREEN Phase: Implement to Pass Tests**
- [ ] 9.2 Implement watch controller
  - Create `src/watch/watch-controller.ts`
  - Implement `watchForErrors(buffer, durationSeconds, source?)` → Promise<WatchResult>
  - WatchResult: `{ events: RuntimeEvent[], watch_duration_ms: number, hot_reload_detected: boolean }`
  - Subscribe to buffer, collect matching events, unsubscribe on timeout or process exit
  - Track whether any hot-reload events were seen during the window
  - Validate duration_seconds against MIN/MAX constants
  - Update `src/watch/index.ts` exports
  - _Requirements: US-1_

**REFACTOR Phase: Clean Up**
- [ ] 9.3 Refactor watch controller and timeline query (if needed)
  - Ensure timer cleanup on all code paths (no leaked timers)
  - Verify subscription cleanup on all code paths (no leaked subscriptions)
  - All tests still pass

#### Checkpoint: Phase 4 Complete

- [ ] All tests passing
- [ ] Watch controller correctly blocks and collects events
- [ ] Timeline query correctly filters by time range
- [ ] No timer or subscription leaks
- [ ] No linting or type errors
- [ ] Changelog updated

---

### Phase 5: MCP Tool Handlers

#### Step 10: watch_for_errors Tool Handler — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 10.1 Write integration tests for watch_for_errors MCP tool
  - Test tool returns correct MCP response format (content array with text)
  - Test tool response includes events, watch_duration_ms, hot_reload_detected
  - Test tool with source filter
  - Test tool with default duration
  - Test tool with invalid duration returns MCP error
  - File: `tests/integration/tools/watch-for-errors.test.ts`
  - _Requirements: US-1_

**GREEN Phase: Implement to Pass Tests**
- [ ] 10.2 Implement watch_for_errors MCP tool handler
  - Create `src/tools/watch-for-errors.ts`
  - Register tool with MCP server using inputSchema from design.md
  - Delegate to watch controller, format response as MCP content
  - _Requirements: US-1_

#### Step 11: get_build_errors Tool Handler — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 11.1 Write integration tests for get_build_errors MCP tool
  - Test tool returns only build-error source events
  - Test tool deduplicates by fingerprint
  - Test tool respects limit parameter
  - Test tool returns empty array when no build errors
  - Test tool response includes total_count
  - File: `tests/integration/tools/get-build-errors.test.ts`
  - _Requirements: US-4_

**GREEN Phase: Implement to Pass Tests**
- [ ] 11.2 Implement get_build_errors MCP tool handler
  - Create `src/tools/get-build-errors.ts`
  - Register tool with MCP server using inputSchema from design.md
  - Query buffer for source='build-error', deduplicate, sort, limit
  - _Requirements: US-4_

#### Step 12: get_error_context Tool Handler — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 12.1 Write integration tests for get_error_context MCP tool
  - Test tool returns error, surrounding_logs, occurrence_count for known fingerprint
  - Test tool returns structured error for unknown fingerprint
  - Test surrounding_logs excludes the error itself
  - Test surrounding_logs are within ±5 second window
  - Test surrounding_logs capped at 50
  - File: `tests/integration/tools/get-error-context.test.ts`
  - _Requirements: US-5_

**GREEN Phase: Implement to Pass Tests**
- [ ] 12.2 Implement get_error_context MCP tool handler
  - Create `src/tools/get-error-context.ts`
  - Register tool with MCP server using inputSchema from design.md
  - Use timeline query module for surrounding logs and occurrence count
  - _Requirements: US-5_

#### Step 13: get_timeline Tool Handler — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 13.1 Write integration tests for get_timeline MCP tool
  - Test tool returns events in chronological order within time window
  - Test tool respects limit and caps at MAX_TIMELINE_LIMIT
  - Test tool with duration_seconds omitted returns events from since to now
  - Test tool response includes window metadata and capped flag
  - Test tool returns empty events for future since timestamp
  - File: `tests/integration/tools/get-timeline.test.ts`
  - _Requirements: US-6_

**GREEN Phase: Implement to Pass Tests**
- [ ] 13.2 Implement get_timeline MCP tool handler
  - Create `src/tools/get-timeline.ts`
  - Register tool with MCP server using inputSchema from design.md
  - Use timeline query module, format response with window metadata
  - _Requirements: US-6_

**REFACTOR Phase: Clean Up**
- [ ] 13.3 Refactor MCP tool handlers (if needed)
  - Extract shared response formatting if patterns emerge across tools
  - Ensure all tool descriptions are self-documenting for agent consumption
  - All tests still pass

#### Checkpoint: Phase 5 Complete

- [ ] All tests passing
- [ ] All four MCP tools registered and responding correctly
- [ ] Tool descriptions are clear and self-documenting
- [ ] No linting or type errors
- [ ] Changelog updated

---

### Phase 6: Integration & Pipeline Wiring

#### Step 14: Pipeline Integration — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 14.1 Write integration tests for full Phase 2 pipeline
  - Test: simulated stdout line matching hot-reload pattern → synthetic event in buffer
  - Test: simulated stderr line matching TypeScript error → build-error event in buffer
  - Test: watch_for_errors collects build errors that arrive during watch window
  - Test: get_error_context returns surrounding logs from the same pipeline run
  - Test: get_timeline returns mixed event types in chronological order
  - File: `tests/integration/phase2-pipeline.test.ts`
  - _Requirements: US-1 through US-6_

**GREEN Phase: Implement to Pass Tests**
- [ ] 14.2 Wire Phase 2 modules into the main pipeline
  - Register build error parsers in the parser registry
  - Wire hot-reload detector into the stdout/stderr processing pipeline
  - Register all four Phase 2 MCP tools in the MCP server
  - Ensure Phase 1 tools continue to work unchanged
  - File: update `src/index.ts` and relevant pipeline wiring
  - _Requirements: all_

**REFACTOR Phase: Clean Up**
- [ ] 14.3 Final cleanup
  - Review all Phase 2 files for commenting standards compliance
  - Ensure no Phase 1 behavior is broken (run full test suite)
  - Remove any temporary test scaffolding

#### Checkpoint: Phase 6 Complete — Phase 2 Done

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] No linting errors (`npm run lint`)
- [ ] No type errors (`npm run typecheck`)
- [ ] Security checkpoint: no hardcoded secrets, all inputs validated, secret redaction covers build error output
- [ ] All four Phase 2 MCP tools work end-to-end
- [ ] Phase 1 MCP tools unaffected
- [ ] Changelog updated with Phase 2 entry
- [ ] Changes committed

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
