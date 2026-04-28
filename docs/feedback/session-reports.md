# Agent Session Reports

Structured session reports from AI coding agents using TracePulse. Raw research data for product decisions.

---

## Report #1 - PlanIQ Session 1

**Date:** 2026-04-28 (afternoon)
**Agent:** Kiro CLI
**Project:** PlanIQ (Python FastAPI backend + Vite React frontend)
**Mode:** Attach (tailing backend log file)
**TracePulse version:** v0.6.0 -> v0.6.1 (upgraded mid-session)
**Session duration:** ~3 hours
**Companion tools:** Chrome DevTools MCP, ViewGraph

### Invocation Stats

| Tool | Calls | Verdict |
|------|-------|---------|
| get_build_errors | ~8x | Best tool - habitual post-change check |
| watch_for_errors | ~5x | Limited - HMR detection blind in attach mode |
| get_errors | ~3x | Useful for baseline checks |
| get_runtime_status | ~2x | Session start health check |
| get_server_logs | ~1x | Used once for log scanning |
| get_new_errors | 0x | No errors to detect |
| get_error_context | 0x | No errors to investigate |
| get_error_trends | 0x | No errors to track |
| get_correlated_errors | 0x | No frontend source configured |
| correlate_with_diff | 0x | Not tested |

### Key Findings

- Agent replaced manual `vite build` with `get_build_errors` after every change
- Freshness metadata (`oldest_event_at`) resolved trust issue with stale data
- `watch_for_errors` HMR detection failed (attach mode, Vite in separate process)
- Agent requested `message_contains` filter 3x before it was built

### Bugs Encountered

None - clean coding session. All tools returned zero errors.

---

## Report #2 - PlanIQ Session 2

**Date:** 2026-04-28 (evening)
**Agent:** Kiro CLI
**Project:** PlanIQ
**Mode:** Attach (tailing backend log file)
**TracePulse version:** v0.6.1 -> v0.7.0 (upgraded mid-session)
**Session duration:** ~4 hours
**Companion tools:** Chrome DevTools MCP, ViewGraph

### Invocation Stats

| Tool | Calls | Verdict |
|------|-------|---------|
| get_build_errors | ~15x | "Single biggest time saver" |
| watch_for_errors | ~8x | "Stopped trusting it" - HMR always false |
| get_errors | ~5x | "Good pre-commit gate" |
| get_runtime_status | ~3x | "Useful for session start" |
| get_server_logs | ~2x | "Improved - structured format much better" |
| get_new_errors | ~1x | Used for pre-commit fingerprint check |
| get_error_context | 0x | No errors to investigate |
| get_error_trends | 0x | No errors to track |
| get_correlated_errors | ~1x | "Always empty" |
| correlate_with_diff | ~1x | "15 changed files, 0 correlations" |

### Key Findings

- `get_build_errors` confirmed as habitual tool (~15x/session)
- `message_contains` filter working well after v0.7.0 upgrade
- `status_code_min` filter available but not tested (no 4xx/5xx in session)
- `last_event_timestamp` available but agent didn't use cursor pattern yet
- `watch_for_errors` lost agent trust due to persistent HMR false negatives

### Bugs Encountered

**Export "Failed to save" bug:**
- Root cause: wrong localStorage key (access_token vs planiq_access_token)
- Request got 401 but never reached backend
- TracePulse was blind - pure frontend issue
- Agent had to read source code manually
- Time lost: ~10 minutes

**Saved views API bug:**
- Root cause: hook expected {items, total} but API returned flat array
- Frontend silently got undefined from data?.items
- No error, no 4xx, just broken UI
- TracePulse was blind - no backend error generated
- Agent had to read source code manually
- Time lost: ~5 minutes

**Transient uvicorn crash:**
- Root cause: file watcher triggered reload mid-write during editing
- TracePulse detected the crash in error buffer
- Agent used `watch_for_errors(10)` after restart to confirm healthy
- First real debugging use case for TracePulse
- Time saved: ~2 minutes (vs manual log checking)

### Agent's Net Assessment

> "TP is a reliable build error gate and error counter. It's not yet a debugging tool - when something breaks, I still read code and run manual checks."

> "Time saved: ~20 minutes from get_build_errors alone (avoided 15+ full Vite builds). Time lost: ~15 minutes on the export bug that TP couldn't surface. Net positive, but the ceiling is much higher."

### Agent's Priority Requests

1. HTTP status code filtering (SHIPPED in v0.7.0)
2. Browser-side error capture (Chrome DevTools MCP scope)
3. watch_for_errors HMR detection fix (uvicorn patterns added v0.6.1, Vite needs multi-file attach)
4. Structured error payloads (Chrome DevTools MCP scope)
5. Request/response pairing (roadmap)
6. "Since last check" cursor (SHIPPED - last_event_timestamp in v0.7.0)

---

## Aggregate Metrics

### Across all sessions

| Metric | Value |
|--------|-------|
| Total sessions | 2 |
| Total tool invocations | ~70 |
| Most used tool | get_build_errors (~23x total) |
| Least used tools | get_error_context, get_error_trends (0x) |
| Bugs TP caught | 1 (transient uvicorn crash) |
| Bugs TP missed | 2 (both frontend-only) |
| Time saved | ~22 minutes (build checks + crash verification) |
| Time lost | ~15 minutes (export bug TP couldn't see) |
| Net time impact | +7 minutes saved |
| Features shipped from feedback | 6 (message_contains, status_code_min, freshness metadata, uvicorn patterns, structlog parser, last_event_timestamp) |

### Tool adoption curve

```
Session 1: get_build_errors = "useful" -> "habitual"
Session 2: get_build_errors = "best tool, single biggest time saver"

Session 1: watch_for_errors = "can't tell if change was picked up"
Session 2: watch_for_errors = "stopped trusting it"

Session 1: get_errors = "can't tell if fresh or stale"
Session 2: get_errors = "good pre-commit gate" (after freshness metadata added)
```

### Feature request velocity

| Request | Sessions until shipped |
|---------|----------------------|
| Freshness metadata on responses | 1 (asked 3x in session 1, shipped same day) |
| message_contains filter | 1 (asked in session 1, shipped same day) |
| status_code_min filter | 1 (asked in session 2, shipped same day) |
| last_event_timestamp cursor | 1 (asked in session 2, shipped same day) |
| uvicorn reload patterns | 1 (asked in session 1, shipped same day) |
| Multi-file attach mode | 1 (asked in session 1, shipped same day) |

---

## How to Add a Report

After each agent session that uses TracePulse:

1. Copy the agent's session report (if it generates one)
2. Add a new `## Report #N` section with:
   - Date, agent, project, mode, version, duration, companion tools
   - Invocation stats table (tool, calls, verdict)
   - Key findings (what worked, what didn't)
   - Bugs encountered (root cause, TP visibility, time impact)
   - Agent's net assessment (quote)
   - Agent's priority requests (with shipped status)
3. Update the Aggregate Metrics section
