# M26: Intelligent Feedback — Requirements

**Date:** 2026-05-19
**Status:** Planned
**Source:** Deep Research §5.7, §6.1, §6.8 | Feedback Wishlists #27, #29 | Untracked Ideas

## Overview

Six features that move TracePulse from "passive error reporter" to "active debugging intelligence." Each feature reduces the number of tool calls an agent needs to diagnose and verify fixes.

---

## Feature 1: `verify_loop(claim, since)`

**Research ref:** Deep Research §6.1 — "highest leverage composite"

### User Story

As an AI coding agent, I want to verify that my fix actually worked in one call, so I don't forget the verify step or need 5-7 separate tool calls.

### Acceptance Criteria

1. Accepts `claim` (string describing what was fixed) and `since` (Unix ms timestamp of the fix)
2. Returns a structured verdict: `{ verified: boolean, confidence: "high"|"medium"|"low", evidence: {...} }`
3. Checks: (a) no new errors since `since`, (b) previously-pinned fingerprints are gone, (c) build is clean, (d) hot-reload detected
4. Confidence scoring: high = all checks pass + fingerprint gone; medium = no new errors but can't confirm fingerprint resolved; low = new errors appeared
5. Collapses `watch_for_errors` + `get_new_errors` + `get_build_errors` + HMR check into one call
6. Blocks for up to `timeout_seconds` (default 10) waiting for hot-reload before returning

### Non-Functional

- Response under 500 tokens
- Timeout default 10s, max 30s
- Must not duplicate logic — compose existing internal functions

### Out of Scope

- Running tests (that's `run_and_watch`)
- Browser-side verification (that's Chrome DevTools MCP)

---

## Feature 2: `get_prompt_context(error_id)`

**Research ref:** Deep Research §6.8 — "pre-assembled reasoning packet"

### User Story

As an AI coding agent, I want a single tool call that gives me everything I need to reason about an error — the error, surrounding logs, recent git diff, file context, and a suggested investigation path — so I can fix it in one attempt instead of calling 4-5 tools.

### Acceptance Criteria

1. Accepts `fingerprint` (error fingerprint from `get_errors`)
2. Returns a token-budgeted context block (max 3000 tokens) containing:
   - Error message + stack trace (truncated to relevant frames)
   - Surrounding log lines ±5s
   - Recent git diff for affected file(s) (if `correlate_with_diff` finds a match)
   - File snippet around the error line (±10 lines)
   - Suggested investigation: "Check line X in file Y — recent change to function Z"
3. Token budget is configurable via `max_tokens` parameter (default 3000)
4. If context exceeds budget, prioritize: error > stack > file snippet > diff > logs
5. Returns `{ context: string, token_estimate: number, sources: string[] }`

### Non-Functional

- Must assemble from existing data (buffer, git, filesystem) — no new data sources
- Response time < 2s (no blocking waits)

### Out of Scope

- AI-generated explanations (this is context assembly, not reasoning)
- Cross-session error history

---

## Feature 3: Per-Fingerprint Anomaly Detection

**Research ref:** Deep Research §5.7 — "anomaly detection vs threshold detection"

### User Story

As an AI coding agent, I want TracePulse to automatically flag when an error's occurrence rate spikes abnormally, so I notice regressions without manually checking `get_error_trends`.

### Acceptance Criteria

1. Maintains a per-fingerprint occurrence-rate baseline (rolling average over last 5 sessions)
2. When a fingerprint fires at 3x+ its baseline rate within a session, marks it as `anomaly: true`
3. Anomalous errors appear first in `get_errors` results (above normal signal scoring)
4. `get_errors` response includes `anomaly_detected: true` and `baseline_rate` for flagged errors
5. Requires persistence enabled (`--persist`) to track cross-session baselines
6. First 3 sessions establish baseline — no anomaly detection until baseline exists

### Non-Functional

- Zero additional memory per fingerprint beyond what persistence already stores
- Baseline stored in `.tracepulse/fingerprints.json` (existing file, new field)
- No external dependencies

### Out of Scope

- ML-based anomaly detection (this is simple statistical: 3x baseline)
- Time-series visualization

---

## Feature 4: Test Runner Summary Parsing

**Research ref:** Feedback Wishlist #27

### User Story

As an AI coding agent, I want `run_and_watch` to return structured pass/fail/warning counts from test runner output, so I can quickly assess test health without parsing raw text.

### Acceptance Criteria

1. Pytest: parse `X passed, Y failed, Z warnings` summary line into `{ passed: X, failed: Y, warnings: Z, skipped: N }`
2. Vitest: parse `Tests X passed | Y failed` into same structure
3. Jest: parse `Tests: X passed, Y failed, Z total` into same structure
4. Go test: parse `ok`/`FAIL` lines with test counts
5. Cargo test: parse `test result: ok. X passed; Y failed` summary
6. Summary appears as top-level `test_summary` object in `run_and_watch` response (alongside existing `test_summary` string)
7. If no summary line detected, `test_summary` remains the string format (backward compatible)

### Non-Functional

- Must not break existing `test_summary` string field (additive only)
- Add `test_counts` field: `{ passed: number, failed: number, skipped: number, warnings: number, total: number }`

### Out of Scope

- Individual test names/statuses (W3 from Prism feedback — separate feature)
- Test duration per-test

---

## Feature 5: Auto-Correlate Errors with File Edits

**Research ref:** Feedback Wishlist #29, BUG-014 gap analysis

### User Story

As an AI coding agent, I want TracePulse to automatically correlate new errors with my recent file edits, so I immediately know which change caused the error without calling `correlate_with_diff` manually.

### Acceptance Criteria

1. When a new fingerprint appears (not seen before in this session), automatically run `correlate_with_diff` logic
2. If correlation found, attach `likely_cause: { file: string, change_summary: string }` to the error in `get_errors` response
3. Correlation runs asynchronously — does not block error ingestion
4. Only correlates errors with signal_score >= 30 (skip low-signal noise)
5. Uses the file-change tracker (already built) to know which files changed since last HMR
6. Result cached per fingerprint — don't re-correlate on every `get_errors` call

### Non-Functional

- Correlation must complete within 500ms (git diff is fast for small diffs)
- No correlation if no uncommitted changes exist (skip the work)

### Out of Scope

- AST-level correlation (M14 item 7 — tree-sitter based)
- Cross-session correlation

---

## Feature 6: Stdin Pipe Mode + CI Output Parsing

**Research ref:** Untracked Ideas Audit, Log Ingestion Flexibility doc

### User Story

As a developer, I want to pipe CI/CD output or any log stream into TracePulse for parsing, so I get structured errors from GitHub Actions, GitLab CI, or any command output.

### Acceptance Criteria

1. `tracepulse pipe` reads from stdin, parses through all 26 parsers, exposes via MCP tools
2. Works with: `tail -f app.log | tracepulse pipe`, `kubectl logs -f pod | tracepulse pipe`
3. CI-specific parsers added:
   - GitHub Actions: `::error file=X,line=Y::message` annotation format
   - GitLab CI: `ERROR:` prefix lines with job context
4. MCP server starts on stdio (separate fd from stdin pipe) OR on HTTP transport
5. When stdin is used for log ingestion, MCP must use HTTP transport (`--http` auto-enabled)
6. Graceful EOF handling — when pipe closes, TracePulse keeps running with buffered events

### Non-Functional

- Must handle high-throughput pipes (1000+ lines/sec) without backpressure
- Ring buffer eviction applies normally (500 events max)

### Out of Scope

- Real-time streaming to remote TracePulse server (M19 scope)
- Log file rotation handling (already in attach mode)
