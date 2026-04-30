# Agent Wishlist - Accumulated

All feature requests from AI agents using TracePulse, with current status.

Last updated: 2026-04-29

| # | Wish | Status |
|---|------|--------|
| 1 | `clear_errors(fingerprint=...)` | ✅ Shipped v0.7.2 |
| 2 | `watch_for_errors` request summary (`total_events_seen`) | ✅ Shipped v0.7.2 |
| 3 | `get_health_summary` one-liner | ✅ Shipped v0.7.2 |
| 4 | `verify_fix` composite tool | ✅ Shipped v0.7.2 |
| 5 | `wait_for_build` event-driven | ✅ Shipped v0.8.0 |
| 6 | `wait_for_event` generic blocking | ✅ Shipped v0.8.0 |
| 7 | `run_and_watch` command execution | ✅ Shipped v0.8.0 |
| 8 | `last_build_at` timestamp | ✅ Shipped v0.7.2 |
| 9 | `last_event_timestamp` cursor | ✅ Shipped v0.7.0 |
| 10 | `status_code_min` filter | ✅ Shipped v0.7.0 |
| 11 | `message_contains` filter | ✅ Shipped v0.6.1 |
| 12 | Freshness metadata on responses | ✅ Shipped v0.6.1 |
| 13 | uvicorn/Django/Flask reload patterns | ✅ Shipped v0.6.1 |
| 14 | Structlog key-value parser | ✅ Shipped v0.6.1 |
| 15 | `hot_reload_detected: null` in attach mode | ✅ Shipped v0.8.0 |
| 16 | Build module count / bundle size delta | 🔲 Remaining |
| 17 | Request/response pairing | 🔲 Roadmap (post-v1.0) |
| 18 | Debounced build errors (2s persistence) | 🔲 Roadmap |
| 19 | File-change correlation with TS errors | 🔲 Roadmap |
| 20 | Previous session error details | 🔲 Roadmap |
| 21 | `verify_fix` should report HMR status with changed filename | 🔲 Roadmap |
| 22 | `verify_fix(duration_seconds: 2)` for quick HMR checks | ✅ Already supported (discoverability issue) |
| 23 | Instant composite: build errors + last HMR status + last error (no wait) | 🔲 Not a new tool - `get_build_errors()` already serves this role |
| 24 | Auto-detect resolved errors (stop showing fixed errors at score 95) | 🔲 Roadmap - error lifecycle management |
| 25 | Auto-expire transient HMR crashes after 60s of no recurrence | 🔲 Roadmap - error lifecycle management |
| 26 | SKILL.md anti-pattern: warn against interactive CLI tools (psql, mysql) | ✅ Shipped |
| 27 | Test runner summary parsing (pass/fail/warning counts in structured fields) | ✅ Shipped |
| 28 | `run_and_watch(command, cwd?)` - working directory parameter for monorepos | ✅ Shipped |
| 29 | Auto-correlate ReferenceError crashes with recent file edits | 🔲 Roadmap - combines ErrorBoundary bridge + correlate_with_diff |

**19 of 29 wishlist items shipped.** 1 buildable now, 8 on roadmap, 1 covered by existing tools.
