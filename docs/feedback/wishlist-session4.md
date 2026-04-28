# Agent Wishlist - Session 4 (Deep Feedback)

Date: 2026-04-29
Agent: Kiro CLI on Acme App
Context: Agent was asked "any other TP wishlists?" and gave structured feedback across 6 themes.

---

## 1. Build Awareness Gap

| Request | Status |
|---------|--------|
| `last_build_timestamp` on `get_build_errors` | ✅ Just shipped (`last_build_at`) |
| `files_compiled_count` during watch window | 🔲 New - parse Vite "X modules transformed" |
| File-watcher event count in `watch_for_errors` | 🔲 New - "3 .tsx files changed during watch window" |

## 2. Surrounding Context on Errors

| Request | Status |
|---------|--------|
| "Last N successful builds before this error" | 🔲 New - build history buffer |
| Auto-correlate TS error with most recently saved file | 🔲 New - file-change tracking + error matching |

**Assessment:** Both are medium effort. The file-change correlation is interesting - if TracePulse tracked file-save events (from the hot-reload detector), it could say "TS2307 appeared 200ms after you saved TopBar.tsx." This would be a differentiator.

## 3. Session Continuity

| Request | Status |
|---------|--------|
| `get_errors(include_previous_session=true)` | 🔲 New - load error details from persistence, not just fingerprints |
| Error details surviving MCP restart | 🔲 Requires persisting full RuntimeEvents, not just fingerprints |

**Assessment:** Currently fingerprint persistence stores only hashes + counts. Storing full error details would increase disk usage but solve a real pain point. Medium effort - extend `fingerprint-store.ts` to optionally persist the last N error messages.

## 4. Frontend/Backend Correlation

| Request | Status |
|---------|--------|
| React Query cache invalidation / stale query warnings | ⬜ Not TP scope - browser-side state |

**Assessment:** Agent correctly flagged this as "not sure if it should." This is Chrome DevTools MCP territory - `list_console_messages` would catch React Query warnings if they're logged to console.

## 5. Noise Filtering

| Request | Status |
|---------|--------|
| Debounced errors - wait 2s before surfacing transient build errors | 🔲 New - smart idea |

**Assessment:** Mid-save syntax errors that auto-resolve are real noise. A debounce on build errors (only surface if the error persists for >2s after first seen) would reduce false positives. Low-medium effort - add a `debounce_ms` option to the buffer or a post-query filter.

## 6. Missing "All Clear" Signal

| Request | Status |
|---------|--------|
| `verify_fix` tool - single call: watch 10s + confirm zero errors + report build status | 🔲 New - composite tool |

**Assessment:** This is the `get_health_summary` concept taken further. A `verify_fix(duration_seconds: 10)` that combines `watch_for_errors` + `get_build_errors` + `get_errors` into one response would save 3 tool calls per fix cycle. The agent does this pattern ~15x per session. High impact.

---

## Priority Ranking

| # | Feature | Effort | Impact | Build? |
|---|---------|--------|--------|--------|
| 1 | `verify_fix` composite tool | Low | HIGH - saves 3 calls x 15/session | Yes, next |
| 2 | Debounced build errors | Medium | HIGH - reduces noise | Soon |
| 3 | File-change correlation with TS errors | Medium | HIGH - differentiator | Soon |
| 4 | Previous session error details | Medium | Medium | Roadmap |
| 5 | Files compiled count | Low | Medium | Soon |
| 6 | Build history buffer | Medium | Low | Roadmap |
| 7 | React Query warnings | N/A | N/A | Not TP scope |
