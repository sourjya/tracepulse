# M26: Intelligent Feedback — Tasks

## Phase 1: Test Runner Summary (1 day)

Lowest risk, highest immediate value. Agents already use `run_and_watch` heavily.

- [ ] 1.1 Add `test_counts` interface: `{ passed, failed, skipped, warnings, total }`
- [ ] 1.2 Extend pytest parser: capture `X passed, Y failed` summary line → test_counts
- [ ] 1.3 Extend vitest parser: capture `Tests X passed | Y failed` → test_counts
- [ ] 1.4 Extend jest parser: capture `Tests: X passed, Y failed, Z total` → test_counts
- [ ] 1.5 Extend go test parser: count `ok`/`FAIL` lines → test_counts
- [ ] 1.6 Extend cargo test parser: capture `test result:` summary → test_counts
- [ ] 1.7 Wire test_counts into `run_and_watch` response (alongside existing `test_summary` string)
- [ ] 1.8 Tests: one per parser with real output samples

## Phase 2: Auto-Correlate Errors with File Edits (2 days)

Builds on existing `correlate_with_diff` and file-change tracker.

- [ ] 2.1 Add `likely_cause` field to RuntimeEvent interface
- [ ] 2.2 On new fingerprint ingestion (signal_score >= 30), trigger async correlation
- [ ] 2.3 Use file-change tracker to get recently modified files
- [ ] 2.4 Run git diff correlation logic (existing function) against new error
- [ ] 2.5 Cache correlation result per fingerprint (don't re-run)
- [ ] 2.6 Include `likely_cause` in `get_errors` response when present
- [ ] 2.7 Tests: new fingerprint with matching diff → likely_cause populated

## Phase 3: verify_loop (1 week)

Composite tool — depends on existing internals being stable.

- [ ] 3.1 Create `src/tools/verify-loop.ts` with handler
- [ ] 3.2 Implement check pipeline: wait for HMR → check new errors → check pinned fingerprints → check build
- [ ] 3.3 Confidence scoring: high/medium/low based on evidence
- [ ] 3.4 Register MCP tool with schema: `claim` (string), `since` (number), `timeout_seconds?`
- [ ] 3.5 Wire into `src/mcp/server.ts`
- [ ] 3.6 Tests: all-pass → high confidence, new error → low confidence, timeout → medium

## Phase 4: get_prompt_context (1 week)

Context assembly from multiple sources.

- [ ] 4.1 Create `src/tools/get-prompt-context.ts`
- [ ] 4.2 Fetch error + stack from buffer by fingerprint
- [ ] 4.3 Fetch surrounding logs (±5s window)
- [ ] 4.4 Run correlate_with_diff for affected files
- [ ] 4.5 Read file snippet (±10 lines around error line)
- [ ] 4.6 Token budget enforcement: prioritize error > stack > snippet > diff > logs
- [ ] 4.7 Generate `suggested_investigation` string
- [ ] 4.8 Register MCP tool: `fingerprint` (string), `max_tokens?` (number)
- [ ] 4.9 Tests: full context assembly, budget truncation, missing file graceful

## Phase 5: Per-Fingerprint Anomaly Detection (2 weeks)

Requires persistence. Statistical baseline tracking.

- [ ] 5.1 Extend fingerprint persistence schema: add `session_counts: number[]` (last 5 sessions)
- [ ] 5.2 On session end, record occurrence count per fingerprint
- [ ] 5.3 On error ingestion, check if current session count > 3x rolling average
- [ ] 5.4 Mark anomalous errors with `anomaly: true` + `baseline_rate`
- [ ] 5.5 Sort anomalous errors above normal in `get_errors` response
- [ ] 5.6 Skip anomaly detection for first 3 sessions (baseline building)
- [ ] 5.7 Tests: baseline building, spike detection, no false positives on first sessions

## Phase 6: Stdin Pipe Mode + CI Parsing (1 week)

New ingestion mode + 2 new parsers.

- [ ] 6.1 Add `pipe` command to CLI argument parser
- [ ] 6.2 Implement stdin reader (readline interface, feeds into pipeline)
- [ ] 6.3 Auto-enable `--http` transport when in pipe mode (stdin used for logs, not MCP)
- [ ] 6.4 GitHub Actions parser: `::error file=X,line=Y::message` format
- [ ] 6.5 GitLab CI parser: `ERROR:` prefix with context extraction
- [ ] 6.6 Handle EOF gracefully (keep MCP server running with buffered events)
- [ ] 6.7 Tests: pipe mode startup, GitHub Actions parsing, GitLab parsing, EOF handling

## Security Checkpoint

- [ ] 7.1 Review: verify_loop doesn't expose file contents beyond what get_errors already shows
- [ ] 7.2 Review: get_prompt_context respects secret redaction on file snippets
- [ ] 7.3 Review: stdin pipe mode doesn't bypass secret redaction
- [ ] 7.4 Review: anomaly detection doesn't leak cross-session data in non-persist mode
