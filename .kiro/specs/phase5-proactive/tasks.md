# Implementation Plan: Phase 5 - Proactive Monitoring

## Overview

Phase 5 shifts TracePulse from pull to push. The agent gets notified of new errors, can correlate them with git changes, and follows structured debugging skills.

**Architecture References:**
- `docs/ideas/feature-architecture-analysis.md` - Phase 5 feature set, Decision 6 (pull-first, push later), Decision 7 (signal scoring)
- `.kiro/specs/phase5-proactive/design.md` - notification architecture, git integration, fingerprint persistence, skills system
- `.kiro/specs/phase5-proactive/requirements.md` - US-1 through US-7, NFRs

**Key Principles:**
- Fingerprint history is the foundation - build it first, everything else depends on it
- Git correlation is best-effort - never fail if git is unavailable
- Skills are static documentation - no execution engine
- Notifications are designed now, wired later - polling fallback is the Phase 5 deliverable

**Development Approach - TDD MANDATORY:**
- **RED → GREEN → REFACTOR**: Write failing tests FIRST, then minimal implementation, then refactor
- NEVER write implementation code before its test
- Each phase below follows strict TDD ordering: tests before implementation
- See `testing-standards.md` for complete TDD guidelines

**Testing Strategy:**
- Unit tests for severity classifier, fingerprint history, git diff parser, MCP tool handlers
- Integration tests for fingerprint persistence (file I/O), git diff correlation (real git repo)
- All tests use vitest

## Tasks

### Phase 1: Severity Classification

#### Step 1: Severity Constants & Types - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 1.1 Write unit tests for severity types and constants
  - Test that `Severity` type accepts only `crash`, `error`, `warning`, `info`
  - Test signal score bonus values: crash=+40, error=+10, warning=+5, info=+0
  - File: `tests/unit/scoring/severity-classifier.test.ts`
  - _Requirements: US-4.6_

**GREEN Phase: Implement to Pass Tests**
- [ ] 1.2 Define severity types and constants
  - Add `Severity` type to `src/types/events.ts`
  - Create `src/constants/scoring.ts` with severity bonus map
  - _Requirements: US-4.1_

#### Step 2: Severity Classifier - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 2.1 Write unit tests for severity classification rules
  - Test crash: process exit non-zero → `crash`
  - Test crash: unhandled exception pattern → `crash`
  - Test crash: SIGKILL/SIGSEGV signal → `crash`
  - Test error: HTTP 5xx in message → `error`
  - Test error: caught exception with stack trace → `error`
  - Test error: log level `error` → `error`
  - Test warning: deprecation notice → `warning`
  - Test warning: HTTP 4xx → `warning`
  - Test warning: log level `warn` → `warning`
  - Test info: startup message → `info`
  - Test info: default fallback → `info`
  - Test priority ordering: first match wins when multiple rules apply
  - File: `tests/unit/scoring/severity-classifier.test.ts`
  - _Requirements: US-4.1, US-4.2, US-4.3, US-4.4, US-4.5_

**GREEN Phase: Implement to Pass Tests**
- [ ] 2.2 Implement severity classifier
  - Create `src/scoring/severity-classifier.ts`
  - Implement `classifySeverity(event: RuntimeEvent): Severity` as a pure function
  - Implement `applySeverityBonus(score: number, severity: Severity): number`
  - _Requirements: US-4.1 through US-4.6_

**REFACTOR Phase: Clean Up**
- [ ] 2.3 Refactor severity classifier if needed
  - Ensure classification rules are data-driven (array of rule objects), not a long if/else chain
  - Verify all tests still pass

#### Step 3: Severity Filter on Existing Tools - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 3.1 Write unit tests for severity filter parameter
  - Test `get_errors` with `severity=crash` returns only crash events
  - Test `get_errors` with `severity=warning` returns only warning events
  - Test `get_errors` with no severity filter returns all events
  - File: `tests/unit/tools/get-errors-severity.test.ts`
  - _Requirements: US-4.7_

**GREEN Phase: Implement to Pass Tests**
- [ ] 3.2 Add severity filter to existing MCP tool handlers
  - Update `get_errors` tool schema to accept optional `severity` parameter
  - Apply filter in tool handler
  - _Requirements: US-4.7_

#### Checkpoint: Phase 1 Complete

- [ ] All tests passing (`npm run test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Severity field present on all RuntimeEvents
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 2: Fingerprint History & Persistence

#### Step 4: Persistence Constants - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 4.1 Write unit tests for persistence constants
  - Test fingerprint file path is `.tracepulse/fingerprints.json`
  - Test session cap is 50
  - Test schema version is 1
  - File: `tests/unit/constants/persistence.test.ts`
  - _Requirements: US-6.4_

**GREEN Phase: Implement to Pass Tests**
- [ ] 4.2 Create persistence constants
  - Create `src/constants/persistence.ts`
  - Define `FINGERPRINT_FILE_PATH`, `SESSION_CAP`, `SCHEMA_VERSION`
  - _Requirements: US-6.4_

#### Step 5: Fingerprint History Manager - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 5.1 Write unit tests for fingerprint history manager
  - Test `loadHistory`: returns empty history when file doesn't exist
  - Test `loadHistory`: returns empty history when file is corrupt JSON, logs warning
  - Test `loadHistory`: parses valid fingerprints.json correctly
  - Test `saveHistory`: writes JSON atomically (temp file + rename)
  - Test `isNewFingerprint`: returns true for unknown fingerprint
  - Test `isNewFingerprint`: returns false for known fingerprint
  - Test `recordFingerprint`: increments total_occurrences
  - Test `recordFingerprint`: updates last_seen timestamp
  - Test `recordFingerprint`: creates new record for first occurrence
  - Test `mergeSession`: adds current session to sessions array
  - Test `mergeSession`: prunes sessions beyond cap (FIFO)
  - Test `getRecord`: returns null for unknown fingerprint
  - Test `getRecord`: returns full FingerprintRecord for known fingerprint
  - File: `tests/unit/persistence/fingerprint-history.test.ts`
  - _Requirements: US-1.4, US-1.5, US-2, US-6.1, US-6.4, US-6.5, NFR-1, NFR-3_

**GREEN Phase: Implement to Pass Tests**
- [ ] 5.2 Implement fingerprint history manager
  - Create `src/persistence/fingerprint-history.ts`
  - Implement `FingerprintHistoryManager` class with:
    - `loadHistory(filePath: string): Promise<FingerprintHistory>`
    - `saveHistory(filePath: string, history: FingerprintHistory): Promise<void>`
    - `isNewFingerprint(fingerprint: string): boolean`
    - `recordFingerprint(fingerprint: string, timestamp: number): void`
    - `mergeSession(): FingerprintHistory`
    - `getRecord(fingerprint: string): FingerprintRecord | null`
  - Use `Set<string>` for O(1) fingerprint lookup
  - Atomic write: write to `.tmp`, then `fs.rename`
  - _Requirements: US-1.4, US-1.5, US-2, US-6, NFR-1, NFR-3_

**REFACTOR Phase: Clean Up**
- [ ] 5.3 Refactor fingerprint history manager if needed
  - Ensure load/save are cleanly separated from in-memory operations
  - Verify all tests still pass

#### Step 6: Integration Test - Fingerprint Persistence

- [ ] 6.1 Write integration test for fingerprint file I/O
  - Test full lifecycle: create dir → save → load → verify contents
  - Test atomic write: verify .tmp file is cleaned up
  - Test corrupt file recovery: write invalid JSON → load → verify empty history + stderr warning
  - File: `tests/integration/persistence/fingerprint-history.test.ts`
  - _Requirements: NFR-3, NFR-6_

#### Checkpoint: Phase 2 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Fingerprint history loads/saves correctly
- [ ] Session pruning works at cap boundary
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 3: New Error Detection & Trends

#### Step 7: `get_new_errors` Tool - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 7.1 Write unit tests for `get_new_errors` tool handler
  - Test returns only events with fingerprints not in history
  - Test `since_session_start=true` scopes to current session events only
  - Test `since_session_start=false` checks all buffer events
  - Test `severity` filter applies on top of novelty filter
  - Test `limit` parameter caps results (default 10)
  - Test returns empty array when all fingerprints are known
  - Test returns all events when history is empty (no fingerprints.json)
  - File: `tests/unit/tools/get-new-errors.test.ts`
  - _Requirements: US-1.1, US-1.2, US-1.3, US-1.5, US-1.6, NFR-4_

**GREEN Phase: Implement to Pass Tests**
- [ ] 7.2 Implement `get_new_errors` MCP tool handler
  - Create `src/tools/get-new-errors.ts`
  - Register tool with MCP server: name `get_new_errors`, params schema, handler
  - Query ring buffer, filter by fingerprint history, apply severity/limit
  - _Requirements: US-1_

#### Step 8: `get_error_trends` Tool - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 8.1 Write unit tests for `get_error_trends` tool handler
  - Test returns correct `first_seen`, `last_seen`, `total_occurrences`, `session_count`
  - Test `recent_sessions` field: `appeared_in` / `out_of` for last 10 sessions
  - Test unknown fingerprint returns error message
  - Test response is < 500 tokens (verify JSON size)
  - File: `tests/unit/tools/get-error-trends.test.ts`
  - _Requirements: US-2.1, US-2.2, US-2.3, US-2.4, US-2.5, US-6.2, US-6.3, NFR-4_

**GREEN Phase: Implement to Pass Tests**
- [ ] 8.2 Implement `get_error_trends` MCP tool handler
  - Create `src/tools/get-error-trends.ts`
  - Register tool with MCP server
  - Query fingerprint history manager for trend data
  - Calculate `recent_sessions` from session history
  - _Requirements: US-2, US-6_

**REFACTOR Phase: Clean Up**
- [ ] 8.3 Refactor tool handlers if needed
  - Extract shared parameter validation into a utility if patterns emerge
  - Verify all tests still pass

#### Checkpoint: Phase 3 Complete

- [ ] All tests passing
- [ ] `get_new_errors` correctly filters by fingerprint history
- [ ] `get_error_trends` returns accurate cross-session stats
- [ ] No linting errors
- [ ] Type check passes
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 4: Git Diff Correlation

#### Step 9: Git Command Executor - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 9.1 Write unit tests for git command executor
  - Test `execGit` returns stdout for successful command
  - Test `execGit` returns null when git is not available
  - Test `execGit` returns null when directory is not a git repo
  - Test `execGit` times out after 5 seconds
  - Test `detectGitRoot` returns repo root path
  - Test `detectGitRoot` returns null for non-git directory
  - File: `tests/unit/correlation/git-diff-correlator.test.ts`
  - _Requirements: US-3.5, NFR-2_

**GREEN Phase: Implement to Pass Tests**
- [ ] 9.2 Implement git command executor
  - Create `src/correlation/git-diff-correlator.ts`
  - Implement `execGit(args: string[], cwd: string): Promise<string | null>`
  - Implement `detectGitRoot(cwd: string): Promise<string | null>`
  - Create `src/constants/correlation.ts` with timeout (5s), proximity window (10 lines), summary max length (200 chars)
  - _Requirements: US-3.5, NFR-2_

#### Step 10: Diff Parser & File Matcher - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 10.1 Write unit tests for diff parsing and file matching
  - Test `parseChangedFiles`: extracts file list from `git diff --name-only` output
  - Test `parseDiffHunks`: extracts line ranges from unified diff format
  - Test `matchErrorToFile`: matches error `context.file` to changed file (normalized paths)
  - Test `matchErrorToFile`: returns null when error has no `context.file`
  - Test `isLineNearHunk`: returns true when error line is within proximity window of hunk
  - Test `isLineNearHunk`: returns false when error line is far from any hunk
  - Test `generateDiffSummary`: produces human-readable summary from hunk header
  - Test `generateDiffSummary`: truncates to 200 characters
  - File: `tests/unit/correlation/git-diff-correlator.test.ts`
  - _Requirements: US-3.2, US-3.3, US-3.4, US-3.6_

**GREEN Phase: Implement to Pass Tests**
- [ ] 10.2 Implement diff parser and file matcher
  - Add to `src/correlation/git-diff-correlator.ts`:
    - `parseChangedFiles(output: string): string[]`
    - `parseDiffHunks(diffOutput: string): DiffHunk[]`
    - `matchErrorToFile(error: RuntimeEvent, changedFiles: string[]): string | null`
    - `isLineNearHunk(errorLine: number, hunks: DiffHunk[]): [number, number] | null`
    - `generateDiffSummary(hunks: DiffHunk[]): string`
  - _Requirements: US-3.2, US-3.3, US-3.4, US-3.6_

#### Step 11: `correlate_with_diff` Tool - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 11.1 Write unit tests for `correlate_with_diff` tool handler
  - Test returns correlations sorted by signal_score descending
  - Test returns empty array when no git repo detected
  - Test returns empty array when no errors have `context.file`
  - Test returns empty array when no changed files match any error
  - Test returns warning message when git is unavailable
  - File: `tests/unit/tools/correlate-with-diff.test.ts`
  - _Requirements: US-3.1, US-3.5, US-3.6, US-3.7_

**GREEN Phase: Implement to Pass Tests**
- [ ] 11.2 Implement `correlate_with_diff` MCP tool handler
  - Create `src/tools/correlate-with-diff.ts`
  - Register tool with MCP server
  - Orchestrate: get errors from buffer → detect git root → get changed files → match → build response
  - _Requirements: US-3_

#### Step 12: Integration Test - Git Correlation

- [ ] 12.1 Write integration test with a real git repo
  - Create a temp git repo with a known diff
  - Inject errors with matching file paths
  - Verify `correlate_with_diff` returns correct correlations
  - Verify timeout behavior with a slow git command (mock)
  - File: `tests/integration/correlation/git-diff-correlator.test.ts`
  - _Requirements: US-3, NFR-2_

#### Checkpoint: Phase 4 Complete

- [ ] All tests passing
- [ ] Git correlation works with real repos
- [ ] Graceful degradation when git is unavailable
- [ ] No linting errors
- [ ] Type check passes
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 5: Notification Dispatcher (Future-Ready)

#### Step 13: Notification Payload & Dispatcher - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 13.1 Write unit tests for notification dispatcher
  - Test `buildNotificationPayload` produces token-efficient payload (< 200 tokens)
  - Test `shouldNotify`: returns true for new fingerprint + high signal_strength
  - Test `shouldNotify`: returns false for known fingerprint
  - Test `shouldNotify`: returns false for low/medium signal_strength
  - Test deduplication: same fingerprint only triggers once per session
  - Test feature flag: dispatcher is no-op when `TRACEPULSE_NOTIFICATIONS` is not set
  - File: `tests/unit/notifications/notification-dispatcher.test.ts`
  - _Requirements: US-5.1, US-5.3, US-5.4, US-5.5_

**GREEN Phase: Implement to Pass Tests**
- [ ] 13.2 Implement notification dispatcher
  - Create `src/notifications/notification-dispatcher.ts`
  - Implement `NotificationDispatcher` class with:
    - `buildNotificationPayload(event: RuntimeEvent): ErrorNotificationPayload`
    - `shouldNotify(event: RuntimeEvent): boolean`
    - `markNotified(fingerprint: string): void`
  - Create `src/constants/notifications.ts` with feature flag name, payload field limits
  - Wire into event pipeline (listener on new events) but do NOT emit MCP notifications yet
  - _Requirements: US-5_

**REFACTOR Phase: Clean Up**
- [ ] 13.3 Refactor notification dispatcher if needed
  - Ensure the dispatcher is cleanly separable - when MCP adds notification support, wiring is a one-line change
  - Verify all tests still pass

#### Checkpoint: Phase 5 Complete

- [ ] All tests passing
- [ ] Notification payload is designed and tested
- [ ] Feature flag gates the dispatcher
- [ ] No linting errors
- [ ] Type check passes
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 6: Agent Skills

#### Step 14: Skill Files

- [ ] 14.1 Create `skills/backend-error-triage.md`
  - 7-step workflow: status → new errors → context → read source → trends → correlate → propose fix
  - Decision trees for high vs medium vs low signal errors
  - _Requirements: US-7.2, US-7.3_

- [ ] 14.2 Create `skills/edit-verify-loop.md`
  - 6-step workflow: edit → watch → check errors → fix → re-watch → confirm clean
  - Decision tree for "errors found" vs "clean reload"
  - _Requirements: US-7.2, US-7.3_

- [ ] 14.3 Create `skills/full-stack-debug.md`
  - 6-step workflow: backend errors → browser console → network requests → correlate → diff → fix
  - References Chrome DevTools MCP tools by name
  - _Requirements: US-7.2, US-7.3, US-7.4_

#### Step 15: Skill Validation

- [ ] 15.1 Verify skills are included in npm package
  - Confirm `"files": ["dist", "skills"]` in package.json (already present)
  - Run `npm pack --dry-run` and verify skills/ files appear in the tarball listing
  - _Requirements: US-7.5_

- [ ] 15.2 Review skills for agent-readability
  - No TracePulse-internal jargon
  - All MCP tool names match actual registered tool names
  - All parameters match actual tool schemas
  - _Requirements: US-7.6_

#### Checkpoint: Phase 6 Complete

- [ ] All 3 skill files created and reviewed
- [ ] Skills included in npm package
- [ ] No jargon or incorrect tool references
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 7: Integration & Security

#### Step 16: End-to-End Integration

- [ ] 16.1 Write integration test for full Phase 5 pipeline
  - Simulate: events enter buffer → severity classified → fingerprint checked → `get_new_errors` returns only novel errors → `get_error_trends` returns accurate stats
  - File: `tests/integration/phase5-pipeline.test.ts`
  - _Requirements: US-1, US-2, US-4_

- [ ] 16.2 Verify backward compatibility
  - Existing Phase 1–4 tool contracts unchanged
  - `get_errors` without severity filter returns all events (including new severity field)
  - `RuntimeEvent` consumers that don't read `severity` are unaffected
  - _Requirements: NFR-5_

#### Step 17: Security Checkpoint

- [ ] 17.1 Security review
  - No secrets in fingerprints.json (fingerprints are hashes, not raw error content)
  - Git commands use `execFile` (not `exec`) to prevent shell injection
  - File paths in git correlation are sanitized (no path traversal)
  - Notification payloads contain no raw log content (message is already redacted by the secret redactor)
  - Feature flag reads from `process.env` only, no user-supplied config injection

- [ ] 17.2 Verify secret redaction still applies
  - Errors surfaced by `get_new_errors` have already passed through the secret redactor
  - `correlate_with_diff` diff summaries contain no secret values (diff output is code, not config)

#### Checkpoint: Phase 7 Complete - Phase 5 Done

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Security checkpoint passed
- [ ] No linting errors
- [ ] Type check passes
- [ ] Backward compatibility verified
- [ ] Changelog updated with Phase 5 entry
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
