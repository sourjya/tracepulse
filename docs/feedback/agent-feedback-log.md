# Agent Feedback Log

Real-world feedback from AI coding agents using TracePulse. Used to prioritize improvements.

---

## 2026-04-28 - Kiro CLI agent on PlanIQ project

**Setup:** Attach mode, tailing Python backend log file. Kiro CLI with Chrome DevTools MCP and ViewGraph also active.

### Feedback on `get_build_errors`

> "Zero build errors - clean baseline. Useful as a gate check. **Improvement idea**: would be nice if it returned a timestamp of last check or 'last build' so I know the data is fresh vs stale from hours ago."

**Status:** ✅ Fixed - Added `oldest_event_at` and `buffer_cleared_at` to `get_build_errors` response.

### Feedback on `get_errors`

> "Zero errors - clean slate. **Gap**: I can't tell if this means 'no errors ever' or 'no errors since last clear'. A `since` field or session start time in the response would help distinguish."

**Status:** ✅ Fixed - Added `session_started_at` to `get_runtime_status` response. Agent should call `get_runtime_status` first to get session context.

### Feedback on screenshots

> "Screenshots are slow to interpret - I can't 'see' the image directly. I have to infer from the snapshot text or ask you. A tool that could describe what's visually wrong would be transformative."

**Status:** Not TracePulse scope - ViewGraph/Chrome DevTools MCP territory.

### Feedback on hot-reload detection

> "No hot-reload detection - After editing a file, I reload the page but can't tell if Vite's HMR already applied the change or if I need a full reload. TracePulse's `watch_for_errors` could help here."

**Status:** ✅ Already built - `watch_for_errors` returns `hot_reload_detected: true/false`. Agent needs to use this tool instead of manual reload checking.

### Feedback on regression detection

> "No automated regression detection - I verify manually after each change, but I can't automatically compare 'before' and 'after' states."

**Status:** Partially addressed - `get_new_errors` shows errors with unseen fingerprints. Full visual regression is ViewGraph scope.

### Feedback on backend error correlation

> "When the frontend shows a blank state, I check `list_network_requests` for 500s, then have to separately check backend logs. TracePulse's `get_errors` will bridge this gap perfectly."

**Status:** ✅ Already built - `get_correlated_errors(url)` matches browser HTTP failures with backend stack traces.

### Feedback on type checking

> "A tool that runs `tsc --noEmit` and returns type errors. Currently I rely on Vite's transform errors."

**Status:** Not TracePulse scope directly, but `get_build_errors` parses TypeScript compiler output if the dev server runs `tsc --watch`.

### Agent's described workflow

> 1. Edit Python file
> 2. Call `get_errors()` - check for import errors, startup crashes
> 3. Navigate to affected page in browser
> 4. Call `get_errors()` again - check for runtime 500s from the request
> 5. If errors: read context, fix, repeat

**Status:** This is exactly the workflow TracePulse was built for. Updated SKILL.md to match this pattern.

### Config location gotcha

Agent initially put TracePulse config in `.kiro/mcp.json` instead of `.kiro/settings/mcp.json`. Tools didn't appear until corrected.

**Status:** ✅ Fixed - Added config file location table to README with warning about Kiro's specific path.

---

## 2026-04-28 (session 2) - Kiro CLI agent on PlanIQ project

**Setup:** Attach mode, tailing Python backend log file. Vite frontend running as separate process.

### Feedback on `watch_for_errors` - hot_reload_detected false positive

> "Zero events in 10s, `hot_reload_detected: false`. The field is useful but it returned false even though Vite should have HMR'd the ListView change. Either it doesn't detect Vite HMR events, or the detection window is too narrow."

**Root cause:** TracePulse is in attach mode tailing the **backend** log file. Vite HMR messages go to the **frontend** dev server's stdout, which is a separate process. TracePulse can't detect hot-reload events it never sees. This is working as designed - but the agent doesn't understand the limitation.

**Status:** 🔲 Planned - Need to:
1. Document this limitation clearly in SKILL.md: "hot_reload_detected only works when TracePulse can see the dev server's stdout (start mode, or attach mode pointed at the right log file)"
2. Consider: in attach mode, should `hot_reload_detected` be `null` instead of `false` to indicate "unknown" vs "definitely no reload"?

### Feedback on `watch_for_errors` - want HMR event details

> "**Improvement idea**: include a `hmr_events_seen` count or list of files that triggered HMR during the watch window, so I know the change was actually picked up."

**Status:** 🔲 Planned - Good idea. When hot-reload IS detected, include which pattern matched and the raw line. Would help agents understand what reloaded.

### Feedback on `get_build_errors` - positive

> "Zero build errors - confirms the JSX/TS compiles cleanly. **Win**: quick confirmation that the template change didn't break anything syntactically. This is the most reliable of the post-change checks."

**Status:** ✅ Working as intended. Agent finds this the most reliable post-change check.

### Feedback on `watch_for_errors` - still can't confirm HMR (repeat)

> "Zero events, no HMR detected. Same issue as before - can't tell if the watch window captured the post-change state. I still need to run `npx vite build` manually to be confident the TS compiles."

**Root cause:** Same as session 2 - attach mode tailing backend log, Vite HMR goes to frontend stdout. Agent doesn't trust TracePulse enough to skip manual `vite build`.

**Status:** 🔲 Tracked in TD-006, TD-007, and roadmap (multi-log attach mode).

### Feedback on `get_build_errors` - staleness concern

> "Zero build errors. But same caveat - this might be reading stale state if the Vite dev server hasn't processed the changes yet."

**Root cause:** Valid concern. TracePulse reports what's in the buffer. If the dev server hasn't written new output to the log file yet, the buffer reflects the old state. There's no way for TracePulse to know whether the dev server has finished processing a change.

**Status:** 🔲 Planned - `oldest_event_at` and `buffer_cleared_at` were added to the response but don't fully solve this. The real fix is multi-log attach mode so TracePulse can see Vite's output directly.

### Feedback on `get_errors` - freshness metadata (3rd request)

> "It would be useful if `get_errors` could show a 'last checked' timestamp or 'session uptime' so I know the error buffer has been actively collecting."

**Status:** 🔲 TD-001 - **Elevated to HIGH priority.** Agent has asked for this three times. `get_runtime_status` has `session_started_at` but the agent doesn't call it. The metadata needs to be on `get_errors` directly.

### Feedback on `get_build_errors` - positive (CSS-only change)

> "Zero errors. **Win**: instant confirmation for a CSS-only change - no need for a full `vite build` here."

**Status:** ✅ Working as intended. Agent is using `get_build_errors` as a fast gate check after changes, replacing manual `vite build` runs. This is the highest-trust tool so far.

### Feedback on `get_build_errors` - noticed freshness metadata

> "Zero errors. **Win**: I notice the response now includes `oldest_event_at` and `buffer_cleared_at` fields - useful for understanding buffer freshness. This is better than before."

**Status:** ✅ TD-001 fix confirmed working. Agent noticed and appreciated the freshness fields.

### Feedback on `watch_for_errors` - HMR gap persists

> "Zero events. Same HMR detection gap."

**Status:** 🔲 Expected - still in attach mode tailing backend log. Tracked in TD-006 and roadmap (multi-log attach mode).

### Feedback on `get_build_errors` - freshness trust established

> "Zero. **Win**: the `oldest_event_at` field confirms the buffer is fresh (timestamp from this session). This addresses my earlier concern about stale data."

**Status:** ✅ Trust problem solved. Agent now uses `oldest_event_at` to self-verify data freshness. No longer needs manual `vite build` as a confidence check. This was the #1 agent pain point - asked 3 times, fixed, confirmed working.

### Feedback on `get_build_errors` - habitual use confirmed

> "Zero. Quick CSS-only change confirmed clean."

**Status:** ✅ Agent now calls `get_build_errors` reflexively after every change (CSS, JSX, TS). No longer runs manual `vite build`. Tool has achieved habitual adoption.

---

### Feedback on `watch_for_errors` - uvicorn reload not detected

> "Zero events. The backend reloaded after auth.py changed (uvicorn --reload) but TP didn't detect it. Same HMR gap."

**Root cause:** uvicorn's `--reload` messages go to the same stderr that TracePulse tails, but the reload message pattern (`WARNING:  WatchFiles detected changes in...`) doesn't match any of the 8 hot-reload patterns (which are all JS-ecosystem: Vite, webpack, nodemon, Next.js, ts-node-dev).

**Status:** 🔲 New finding - need to add uvicorn/Django/Flask reload patterns to hot-reload detector. This is a quick fix (add regex patterns), not the attach-mode visibility issue.

### Feedback on `get_errors` - freshness confirmed again

> "Zero. Clean. The `session_started_at` and `oldest_event_at` fields are useful for confirming the buffer is active and fresh."

**Status:** ✅ Freshness metadata fully adopted by agent.

### Feedback on `watch_for_errors` - uvicorn reload (repeat, already fixed)

> "Zero events. Same `hot_reload_detected: false` gap. If TP could parse uvicorn's 'Detected changes in...' stdout line, this field would actually be useful."

**Status:** ✅ Already fixed in v0.6.1 - uvicorn/Django/Flask patterns added to hot-reload detector. Agent is on a pre-fix session. Will work after session restart.

## Adoption Summary

| Tool | Agent Trust Level | Usage Pattern |
|------|------------------|---------------|
| `get_build_errors` | **High** - habitual | Called after every change as gate check |
| `get_errors` | **Medium** - useful | Called for backend error triage |
| `watch_for_errors` | **Low** - limited by attach mode | HMR detection blind in current setup |
| `get_runtime_status` | **Not observed** | Agent prefers `get_errors` directly |

### Agent feature requests - session 3 (detailed debugging gaps)

The agent identified 6 improvements after debugging a real export failure. Theme: "reduce tool calls from 5 to 1-2."

> **1. "Last N requests to this endpoint" tool** - `get_requests(path="/export", limit=5)` returning method, status, duration, error body. Currently has to scan `get_server_logs` hoping the request is in the buffer.

> **2. Structured error payloads** - TracePulse captures the raw uvicorn log line (`GET /api/v1/.../export 422`) but the actual error response body (`{"detail": "Project not found"}`) is lost. Wants response body attached to the event.

> **3. "What changed since my last check" diff** - Calls `get_errors` repeatedly, sees same events. Wants `since_last_check=true` or auto-incrementing cursor so it only sees new events without tracking timestamps manually.

> **4. Frontend-backend request pairing** - `get_correlated_errors` always returns empty because no browser-side source feeds the frontend buffer. Wants browser failed network requests captured automatically.

> **5. Health probe** - `list_services` shows process is running but not if it's healthy. Wants periodic `GET /health` probe surfaced in `get_runtime_status` as `last_health_check: 200, 45ms ago`.

> **6. Log-level awareness** - Backend uses structlog with levels but TracePulse captures everything as `level: "info"` from stdout. Wants structlog JSON parsed to preserve actual log level so `get_server_logs(level="warning")` filters correctly.

**Status and scope analysis below.**

---

## How to add feedback

When an agent provides feedback about TracePulse tools, add an entry here with:
1. Date and context (which agent, which project, which mode)
2. The exact feedback quote
3. Status: ✅ Fixed, 🔲 Planned, ⬜ Not in scope
4. What was done (or why it's out of scope)
