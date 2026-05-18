# Agent Feedback Log

## Purpose

This is the canonical log for real-world agent behavior observations, tool usage feedback, chokepoints, and process violations. **If you are an AI agent and you observe any of the following during a session, append an entry to this file:**

- TracePulse tool that didn't work as expected, returned unhelpful output, or was missing a needed capability
- Shell fallback when `run_and_watch` should have been used
- Process violation (no verification before deploy, no chokepoint logged on repeated failure, no browser check)
- Time saved or lost due to TracePulse tools (with estimates)
- Chokepoint analysis (how many attempts before green, what tool helped)
- Gap identification (what tool/feature would have prevented the issue)

**Format:** Use a `## YYYY-MM-DD - <short description> (<project name>)` header. Include: context, what happened, root cause, what should have happened, TP gap assessment, and status.

**Do NOT delete or edit existing entries.** This is an append-only log.

**⚠️ PRIVATE NAME SCRUBBING — MANDATORY:** This is a PUBLIC repo. Never use real private project or package names. Use anonymized names: "Nexus" (full-stack app), "Prism" (library monorepo), "Studio" (creative tool), or generic descriptions. The pre-commit hook will reject commits containing private names. See `.kiro/steering/user-project-overrides.md` for the full list of banned names.

---

## 2026-04-28 - Kiro CLI agent on Nexus project

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

## 2026-04-28 (session 2) - Kiro CLI agent on Nexus project

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

### Session Report - Full Day Usage (2026-04-28 evening)

The agent produced a comprehensive session report after ~35 tool invocations across a full day of Nexus development.

**Usage stats:** `get_build_errors` ~15x, `watch_for_errors` ~8x, `get_errors` ~5x, `get_runtime_status` ~3x, `get_server_logs` ~2x, `get_new_errors` ~1x, `get_error_trends` 0x, `get_error_context` 0x.

**Net assessment from agent:**
> "TP is a reliable build error gate and error counter. It's not yet a debugging tool - when something breaks, I still read code and run manual checks. The gap is frontend visibility and request-level filtering."

> "Time saved: ~20 minutes from get_build_errors alone (avoided 15+ full Vite builds). Time lost: ~15 minutes on the export bug that TP couldn't surface. Net positive, but the ceiling is much higher."

**What worked (agent's words):**
- `get_build_errors`: "Best tool. Fast, reliable, always fresh. Single biggest time saver."
- `get_errors` + `get_new_errors`: "Good pre-commit gate. Confirmed zero new fingerprints before each commit."
- `get_server_logs`: "The new structured format with http_status, framework, occurrence_count was much better than raw log lines."
- `get_runtime_status`: "session_started_at confirmed fresh sessions after restarts."

**What didn't work:**
- `watch_for_errors`: "hot_reload_detected always false for Vite HMR. Stopped trusting it."
- `get_correlated_errors`: "Always empty. No browser-side error source."
- `correlate_with_diff`: "15 changed files, 0 correlations. Untested in real debugging."

**Two debugging failures TracePulse missed:**
1. Export bug: wrong localStorage key (access_token vs acme-app_access_token). Request got 401 but never reached backend. Pure frontend issue - TP was blind.
2. Saved views API: hook expected {items, total} but API returned flat array. Frontend silently got undefined. No error, no 4xx, just broken UI.

**Agent's priority list:**
1. HTTP status code filtering (DONE in v0.7.0)
2. Browser-side error capture (Chrome DevTools MCP scope)
3. watch_for_errors HMR detection (uvicorn patterns added in v0.6.1, Vite needs attach-mode fix)
4. Structured error payloads (Chrome DevTools MCP scope)
5. Request/response pairing (roadmap - request tracking buffer)
6. "Since last check" cursor (DONE - last_event_timestamp in v0.7.0)

**Status:** Items 1 and 6 already shipped. Item 3 partially fixed. Items 2 and 4 are Chrome DevTools MCP scope (documented in SKILL.md routing guide). Item 5 is on the post-v1.0 roadmap.

## Adoption Summary (end of day 1)

| Tool | Trust Level | Usage | Agent Verdict |
|------|------------|-------|---------------|
| `get_build_errors` | **Highest** - habitual | ~15x/session | "Best tool. Single biggest time saver." |
| `get_errors` | **High** - pre-commit gate | ~5x/session | "Good pre-commit gate. Gave confidence to keep shipping." |
| `get_new_errors` | **Medium** - useful | ~1x/session | Used for pre-commit fingerprint check |
| `get_runtime_status` | **Medium** - session start | ~3x/session | "Useful for session start. Quick health check." |
| `get_server_logs` | **Medium** - improved | ~2x/session | "Structured format much better than raw log lines." |
| `watch_for_errors` | **Low** - distrusted | ~8x/session | "Stopped trusting it. hot_reload_detected always false." |
| `get_correlated_errors` | **None** - always empty | ~1x/session | "Always empty. No browser-side error source." |
| `correlate_with_diff` | **Untested** | ~1x/session | "0 correlations. Untested in real debugging." |
| `get_error_context` | **Unused** | 0x | No errors to investigate |
| `get_error_trends` | **Unused** | 0x | No errors to investigate |

### hot_reload_detected finally returned true!

Agent restarted the server after fixing the activity endpoint bug, then called `watch_for_errors(10)`:

> "Zero events AND `hot_reload_detected: true`! **Win** - the HMR detection actually worked this time after the restart. The activity endpoint fix is live and no errors. This is the first time `hot_reload_detected` returned true this session - confirms the server reloaded with the new code."

**Status:** ✅ The uvicorn reload patterns (shipped v0.6.1) are working. The agent's previous sessions had `hot_reload_detected: false` because the patterns weren't in the code yet. After the v0.6.1+ build, the detection works. The agent now trusts the watch_for_errors workflow: clear -> restart -> watch -> confirm clean.

### get_errors caught live bug with 42 occurrences

Agent called `get_errors(limit: 3)` and found `AttributeError: 'EntityMeta' object has no attribute 'get'` with 42 occurrences on the activity endpoint.

> "**Win** - caught a live bug! AttributeError with 42 occurrences. This is the activity endpoint still crashing."

> "**Wishlist**: if the error included the file + line number in the `context` field, I wouldn't need to grep for it."

**Status:** ✅ Bug caught. The occurrence_count (42) told the agent this was a persistent issue, not transient. The Python parser should extract file:line from tracebacks - needs investigation why `context.file` was empty for this error (likely uvicorn logs the error message without the full traceback on a single line).

### Wishlist: bundle size delta in get_build_errors

> "I wish this tool also returned the Vite module count or bundle size delta so I could track if my changes are bloating the bundle. Something like `"modules": 910, "delta": +2` would be useful for awareness without running a full build."

**Status:** 🔲 Interesting idea. Vite prints module count and build time in its output (`910 modules transformed`, `built in 1.06s`). TracePulse could parse these from the Vite build output and include them in `get_build_errors` response. Low effort if the dev server prints build stats to stdout. Add to post-v1.0 roadmap.

### "Last build timestamp" request

> "Can't confirm the dev server actually recompiled. The `oldest_event_at` timestamp is from session start, not from last compilation. A 'last build timestamp' field would help distinguish 'no errors because build succeeded' from 'no errors because build hasn't run yet.'"

**Status:** 🔲 Valid gap. TracePulse knows when events arrived but not when the last compilation happened. If the Vite/webpack build parser sees a "compiled successfully" line, it could store that timestamp and surface it in `get_build_errors` as `last_build_at`. Low effort, high trust value.

### hot_reload_detected still false in attach mode (repeat)

> "hot_reload_detected: false - this is the attach-mode limitation. Would be more useful if it could detect file-change events from the Vite process even in attach mode."

**Status:** 🔲 Known limitation. Multi-file attach (shipped v0.7.0) solves this if agent tails both backend + frontend logs. Agent hasn't tried multi-file attach yet.

### "Pinned errors" gap - errors age out of buffer

> "Error not found - the buffer was likely cleared or the error aged out. This is the 'pinned errors' gap - once an error leaves the buffer, it's gone."

Agent had the fingerprint from a previous `get_errors` call but by the time it called `get_error_context`, the error had been evicted from the 500-event ring buffer. Had to fall back to reading the source file directly.

**Status:** 🔲 New gap. Options:
1. Increase ring buffer size (simple but uses more memory)
2. "Pin" high-signal errors so they survive eviction
3. Store last N error details in fingerprint persistence (already has `last_message` field)

### "HMR completed for N files" in watch_for_errors

> "Would be useful if watch_for_errors could report 'HMR completed successfully for N files' rather than just silence. Silence means either 'nothing happened' or 'everything is fine' - can't distinguish."

**Status:** Partially addressed - `total_events_seen` field (shipped v0.7.2) shows event count during window. If > 0, something happened. But doesn't specifically say "HMR completed for N files." The file change tracker (shipped post-v0.8.1) captures which files triggered reloads but isn't wired into watch_for_errors response yet.

**Fix:** Wire file change tracker into watch result: `{ hot_reload_detected: true, files_changed: ["auth.py", "models.py"], total_events_seen: 12 }`. Low effort.

### First real error caught by filtering - 500 on activity endpoint

Agent reported "nothing shows" on the activity page. Used `get_server_logs(limit: 10, message_contains: "/activity")` and **immediately found the 500 error** on line 50 of activity.py.

Agent's feedback:
> "**Win** - immediately found the 500 error on the project activity endpoint. Line 50 of `activity.py` is crashing. The `message_contains` filter worked perfectly to scope to activity-related requests."

**Status:** ✅ This is the first time TracePulse caught a real runtime error through filtering. The `message_contains` feature (shipped same day it was requested) directly enabled this. Without it, the agent would have scanned 10+ log lines manually.

### First real debugging use case - transient crash detection

Agent was editing user.py when uvicorn's file watcher triggered a reload mid-write, causing a brief crash. Agent used `watch_for_errors(10)` after restart to confirm the server was healthy again. Agent's assessment: "Zero events after restart. Server is healthy. The previous errors were transient from a mid-write reload."

**Status:** ✅ This is the first time TracePulse was used for actual debugging (not just build checking). The watch_for_errors -> restart -> watch_for_errors pattern worked as designed.

**Key metric:** 20 minutes saved (build checks) vs 15 minutes lost (export bug TP couldn't see). Net +5 minutes, but ceiling is "much higher" per agent.

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

### verify_fix efficiency confirmed + wishlist #18

Agent used `verify_fix` after a code change. Result: PASS, 0 new errors, 4 stale in buffer.

Agent's feedback:
> "TP efficiency note: verify_fix is the fastest way to confirm a change is clean - one call instead of three (watch + build + errors)."

**Wishlist #18:** verify_fix should report HMR status ("HMR completed for TaskDetailDrawer.tsx") so the agent knows the browser picked up the change without needing to check manually.

**Status:** verify_fix efficiency validated. Wishlist #18 logged - would require wiring file-change tracker output into verify_fix response. Low-medium effort.

### verify_fix duration too long for HMR checks + wishlist #19

Agent calling verify_fix after every small change. Default 15s wait is excessive for "did HMR succeed?" checks.

Agent's feedback:
> "TP efficiency observation: I'm calling verify_fix after every small change. It takes 5s each time. For rapid iteration, a 2s timeout would be sufficient for HMR-only checks."
> "TP wishlist #19: verify_fix should accept duration_seconds: 2 for quick HMR checks vs duration_seconds: 15 for full integration checks. The default 15s is too long for 'did HMR succeed?' verification."

**Status:** verify_fix already accepts `duration_seconds` parameter. Agent may not be aware. Check if SKILL.md documents this parameter clearly. If it does, this is a discoverability issue, not a missing feature.

### get_build_errors preferred for rapid iteration + wishlist #20

Agent discovered that `get_build_errors` returns instantly vs verify_fix's 5-15s wait, making it better for rapid iteration.

Agent's feedback:
> "TP efficiency note: get_build_errors is faster than verify_fix for a quick 'is the build broken?' check - returns instantly vs waiting 5-15s. Good for rapid iteration."
> "TP wishlist #20: A single tool that combines get_build_errors (instant) + 'last HMR status' (instant) would be the ideal rapid-iteration check. No need to wait for watch_for_errors duration."

**Status:** Interesting pattern emerging - agent wants a "quick check" tool (instant, no blocking) vs "thorough check" tool (blocking, watches for new errors). Wishlist #20 would be a lightweight composite: build errors + last HMR event + last error timestamp. Zero wait time.

### TP as pre-flight check in frontend-focused session

Agent ran a layout padding audit across 8 pages. First action was `check_port([5176, 8100])` to confirm both servers running. Rest of session was Chrome DevTools MCP (screenshots, console errors, navigation).

Agent's usage pattern:
> TracePulse: pre-flight health check (1 call). Chrome DevTools MCP: visual audit + debugging (20+ calls). Correct tool selection - TP for infra, DevTools for frontend.

**Insight:** The "nothing wrong" signal from check_port is as valuable as error detection. Agent didn't waste time debugging phantom issues from a dead server. This validates the three-layer stack design: TP for backend health, DevTools for browser, ViewGraph for visual.

### verify_fix confirms frontend audit fixes + tsc blind spot

After fixing the missing route and missing `members` variable, agent ran `verify_fix(5)`. Result: PASS, 7 HMR transient errors in buffer (expected from route change).

Agent's feedback:
> "TP win: The visual audit with Chrome DevTools caught two real bugs (missing route, missing variable) that tsc --noEmit didn't flag because members was used in JSX that TypeScript couldn't trace through the lazy-loaded component boundary."

**Insight:** This is a concrete example of the three-layer stack catching what single tools miss. tsc --noEmit (static analysis) missed the bug. Chrome DevTools (runtime browser) caught it. TracePulse (runtime backend) confirmed the fix was clean. Each layer covers a different blind spot.

### Migration workflow without TP - manual shell commands

Agent created an alembic migration for 2 new columns. Autogenerate picked up 161 lines of schema drift (index drops, nullability changes, table drops). Agent had to manually read, identify drift, and rewrite to 10 lines. All done via shell commands.

**What TP could have provided:**
- `get_migration_status()` for pre-flight check (current vs head)
- `verify_fix(5)` after `alembic upgrade head` to confirm no column-missing errors
- Error narratives for migration failures

**Gap identified:** Schema drift detection (M12 item 10, post-v1.0). When autogenerate produces changes beyond the intended scope, TP should flag it. This session shows the real cost: 161 lines of dangerous drift that the agent had to manually triage.

### verify_fix as task completion gate

Agent used `verify_fix` as the final step before marking task complete. PASS result served as the "green light" to move on.

**Pattern:** verify_fix is becoming the standard task completion gate - agent calls it after every meaningful change, treats PASS as permission to proceed. This is the edit-verify loop working as designed.

### Honest assessment: TP blind spot on UI polish work

Agent did Sparq UI rename/resize work. TP was not useful for the core task (visual changes, icon swaps, drag/resize). Agent's assessment:

**Where TP helped this session (despite UI focus):**
- Caught 40 notification 401 errors the agent wouldn't have noticed
- Caught health.py NameError at signal_score 95 (stale but real)
- HMR crash detection proved ErrorBoundary bridge works (367 events)

**Where TP is blind:**
- Visual regression (icon renders correctly?)
- Component dimensions (800px expected, 400px actual)
- Interaction testing (drag, resize, expand/collapse)

**New wishlist items from external project (items 22-26):**
- #22: Auto-detect resolved errors (stop showing fixed errors at score 95)
- #23: Auto-expire transient HMR crashes after 60s
- #24: Visual snapshot diffing (screenshot diff after UI changes)
- #25: Component render monitoring (0x0 dimensions, missing children)
- #26: Interaction replay (lightweight Playwright in dev loop)

**Assessment:** Items 22-23 are buildable in TP (error lifecycle management). Items 24-26 are ViewGraph/DevTools territory, not TP. The agent correctly identified the boundary: TP = backend/runtime, DevTools = browser, ViewGraph = visual. Each tool has its lane.

### get_errors caught migration-applied-but-column-missing bug (18 occurrences)

Agent called `get_errors(limit: 10)` and found `column automation_rules.run_count does not exist` at signal_score 95 with 18 occurrences. The migration was created and applied via Alembic (`alembic current` shows head), but the column doesn't exist in the database.

Agent's analysis:
> "Excellent catch - real bug at signal 95. The migration was created and applied via Alembic, but the running dev server is connecting to the DB with the app user, and the migration ran successfully. This means either: 1. The migration didn't actually apply (wrong DB?) 2. The server restarted before the migration ran."

**Why this matters:** This is the exact bug type that `get_migration_status` was designed for. The agent had to manually run `alembic current` and then query `information_schema.columns` to diagnose. With `get_migration_status`, the discrepancy between "alembic says applied" and "column doesn't exist" would be surfaced automatically.

**Also notable:** TP correctly separated the real bug (signal 95, 18 occurrences) from transient HMR noise (SparkleIcon, attachedFiles, members - all from mid-edit hot reloads). Signal scoring worked as designed.

### Agent hung on interactive psql password prompt

Agent ran `psql -U postgres -d nexus -c "SELECT..."` via shell. psql prompted for password interactively, blocking the session. User had to intervene.

**Root cause:** Agent didn't use DATABASE_URL from .env. Tried bare psql which requires interactive auth.

**TP could help:**
1. `get_migration_status` already avoids this for migration checks
2. SKILL.md should warn: "Never run psql/mysql/redis-cli directly - they prompt for passwords. Use run_and_watch with connection string from .env"
3. Future: TP could expose a `run_db_query(sql)` tool that reads DATABASE_URL from .env and runs non-interactive queries

**Wishlist #26:** SKILL.md anti-pattern warning for interactive CLI tools (psql, mysql, redis-cli, mongo) that hang on password prompts.

### verify_fix(3) as quick post-import check

Agent ran import validation script, then `verify_fix(duration_seconds: 3)` as a quick confirmation. PASS with 16 stale events. Agent is now consistently using the short duration (3s) for quick checks vs default 15s for thorough checks - the two-tier pattern from wishlist #22 is being adopted naturally.

### Three-tier verification pattern emerging

Agent's workflow for this task:
1. `tsc --noEmit` (static check, instant)
2. `verify_fix(3)` (runtime check, 3s)
3. Full test suite + vite build (final gate, ~20s)

This is a natural three-tier pattern: static -> runtime -> comprehensive. TP fills the middle tier that tsc can't cover (runtime errors from the running server). The agent only runs the expensive full suite at task completion, not after every edit.

### run_and_watch allowlist friction - cd prefix blocked

Agent tried `run_and_watch("cd /path && bash scripts/test-backend.sh")` - blocked because `cd` isn't in the allowlist. Self-corrected to `run_and_watch("bash /path/scripts/test-backend.sh")` which worked.

**Action taken:** Updated SKILL.md to document the allowlist and "no cd prefix" rule. The agent adopted run_and_watch for tests (as recommended in the three-tier pattern) on the same session it was documented.

### run_and_watch doesn't parse test summary into structured fields

Agent used `run_and_watch("bash .../test-backend.sh")` - worked, reported success/fail and exit code. But didn't extract pytest's `554 passed, 11 warnings` into structured fields.

Agent's feedback:
> "run_and_watch should parse pytest output to extract 554 passed, 11 warnings into structured fields like {passed: 554, failed: 0, warnings: 11}. Currently it only reports success/fail and error count from TP's event parsers, not the test runner's own summary."

**Root cause:** pytest parser's SUMMARY_PATTERN only matches lines containing "failed" or "error". A clean pass (`554 passed, 11 warnings`) doesn't match. Same gap likely exists for vitest/jest.

**Fix:** Extend test runner parsers to capture success summaries as info-level events with structured counts. Low effort, high value - the agent wants to know pass count, not just fail count.

**Wishlist #27:** Test runner summary parsing - extract pass/fail/warning counts from pytest, vitest, jest summary lines into structured response fields.

### run_and_watch adopted for backend tests, shell still used for frontend

Agent used `run_and_watch` for all 3 backend test runs in this session (import check, targeted test, full suite). But frontend tests (`npx vitest run`, `npx vite build`) still ran via shell - likely because the agent needs to `cd` to the frontend directory first, hitting the same allowlist friction.

**Pattern:** run_and_watch works well for single-directory projects. Multi-directory monorepos (backend + frontend in separate dirs) create friction because the agent can't `cd` before running. Possible fix: add a `cwd` parameter to run_and_watch so the agent can specify the working directory.

### get_errors persistence drives fix - stale run_count error finally addressed

Agent called `get_errors(limit: 3)` between tasks. Same run_count column error still showing. Instead of ignoring it again, the agent decided to fix it by making the columns optional in the ORM model.

**TP value:** The persistent visibility of the error (showing up every time the agent checks) created pressure to fix it. Without TP, this error would have been invisible after the first terminal scroll-away. TP's "errors don't disappear until fixed" behavior is working as designed - it's annoying enough to drive action.

### clear_errors used correctly to dismiss known stale errors

Agent recognized the run_count errors were stale (asyncpg prepared statement cache, resolves on restart). Used `clear_errors()` to reset the buffer and move on to new work instead of wasting time on a known issue.

**Pattern:** get_errors -> recognize stale -> clear_errors -> continue. This is the correct workflow for known issues that require a restart. TP's clear_errors serves as "I've acknowledged this, stop showing it."

### run_and_watch caught 5 test failures from model change

Agent ran `run_and_watch("bash .../test-backend.sh tests/unit/")` after adding `trigger_value` to the rule model. TP reported 5 failures in test_rule_engine.py - mock rules missing the new attribute. Agent immediately knew the file and cause without reading raw pytest output.

**TP value:** Structured failure reporting. Agent didn't need to parse "FAILED tests/unit/test_rule_engine.py::test_..." from raw text - TP's pytest parser extracted it.

### Frontend tests still via shell despite cwd param being shipped

Agent ran `npx vitest run` and `npx vite build` via shell with `cd frontend &&` prefix. The `cwd` parameter was shipped this same session but agent hasn't adopted it yet. Expected to pick up on next session when SKILL.md is re-read.

**Note:** vite build showed an error (`errors: [Getter/Setter]`) that would have been parsed by TP if run via `run_and_watch("npx vite build", cwd: "./frontend")` instead of shell.

### visibleColOrder ReferenceError missed by tsc, caught by user

Agent replaced `colOrder` with `visibleColOrder` in ListView.tsx. `tsc --noEmit` passed. `verify_fix(3)` passed (backend was clean). But the page crashed with `visibleColOrder is not defined` - the variable was scoped to ListView but referenced in a view that doesn't have it.

**Root cause:** Same blind spot as the Rules tab 404 - TypeScript can't trace runtime scope through lazy-loaded component boundaries. The ErrorBoundary caught it visually but TP didn't surface it because it's a frontend-only ReferenceError.

**What would have caught it:**
1. `verify_fix` + navigating to the page in the browser (Chrome DevTools MCP `list_console_messages(types: ["error"])`)
2. The ErrorBoundary -> TP log collector bridge (if wired)
3. Wishlist #25: component render monitoring

**Lesson:** The three-tier pattern needs a tier 1.5: after frontend changes, navigate to the affected page and check console errors before calling verify_fix. tsc + verify_fix alone misses frontend runtime errors.

### Agent root-caused visibleColOrder bug + wishlist #29

Agent fixed the ReferenceError: `visibleColOrder` was in ListView scope but used inside a memo'd SortableRow component that only has access to its own props. Fix: pass it as a prop.

Agent's wishlist:
> "TP should detect ReferenceError crashes from the ErrorBoundary bridge and correlate them with recent file changes. If `visibleColOrder is not defined` appears right after I edited ListView.tsx, TP should flag 'likely caused by your last edit to ListView.tsx - check variable scoping.'"

**Assessment:** This combines two existing capabilities: (1) ErrorBoundary bridge (already captures crashes), (2) `correlate_with_diff()` (already links errors to git changes). The missing piece is automatic correlation - TP would need to auto-run correlate_with_diff when a new ReferenceError appears and include the result in the error response. Feasible but requires the file-change tracker to be wired into the error narrative system.

### Agent adopted cwd param on first session after SKILL.md update

Agent read updated SKILL.md, immediately tried `run_and_watch("npx vitest run", cwd: "./frontend")`. First real-world test of the cwd parameter (#28). Also used `get_project_health()` as session opener - the recommended workflow pattern.

**Adoption speed:** Same day as SKILL.md update. The three-tier pattern and cwd examples in SKILL.md drove immediate behavior change.

### cwd works for frontend, fails for Python venv backend

`run_and_watch("npx vitest run", cwd: "./frontend")` - works perfectly.
`run_and_watch("python -m pytest tests/unit/", cwd: "./backend")` - fails, system Python doesn't have deps.

Agent fell back to `bash scripts/test-backend.sh` which activates the venv internally.

**Gap:** run_and_watch inherits process.env but doesn't activate Python virtualenvs. Options:
1. Add `env` parameter to run_and_watch for custom env vars (e.g., `PATH=.venv/bin:$PATH`)
2. Agent uses `bash -c "source .venv/bin/activate && pytest"` (but shell metacharacters are blocked)
3. Agent wraps in a script (current workaround)

**Wishlist #30:** run_and_watch should support `env` parameter for custom environment variables, or auto-detect `.venv/bin/python` when cwd contains a virtualenv.

### Full build round summary - TP caught 3 real issues

Agent completed a full build round. TP catches:
1. **JSONB NameError at signal 95** (11 occurrences) - stale server process. Agent forced reload via `touch main.py`, `clear_errors`, `watch_for_errors(5)` - zero errors after.
2. **projects.settings 500s** - caught during development
3. **structlog event keyword conflict** - would have crashed in production

**Workflow pattern now fully established:**
- `run_and_watch` for all tests (backend via bash script, frontend via cwd)
- `get_errors(limit: 3)` as health check between tasks
- `clear_errors` + `watch_for_errors` to verify after forced reload
- Three-tier verification: tsc -> verify_fix -> run_and_watch full suite

**Agent's own assessment:** "TP catches: JSONB NameError (stale server), projects.settings 500s, structlog conflict." Three real bugs caught by TP in one build round.

### UI pattern violation - not TP scope but interesting meta-question

Agent created a Settings tab bar as a separate sticky div below TopBar instead of extending TopBar. User caught it visually. Agent's introspection: "I was lazy. I took the path of least resistance instead of the correct path."

**TP can't help here** - this is a visual/architectural pattern violation, not a runtime error. The correct tools are ViewGraph (capture diffing) and steering files (ux-patterns.md).

**Meta-insight:** The agent's self-assessment is valuable product feedback. When agents explain WHY they made a mistake, it reveals what guardrails are missing. In this case: "Before creating any new header/tab element, check if TopBar already handles it." This is a steering file rule, not a tool feature.

### First real-world use of get_error_clusters - 59 errors triaged in seconds

Agent called `get_error_clusters()` and got 7 clusters from 59 errors. Quickly triaged:
- 4 clusters: stale (HMR transients, asyncpg cache) - dismissed
- 2 clusters: investigated (useAuth import, SortableFolderWrapper render prop) - confirmed stale after code review
- Result: zero real bugs, `clear_errors()` to reset

**TP value:** Without clustering, the agent would have seen 59 individual errors and spent significant tokens reading each one. With clustering, it saw 7 groups, triaged in one pass, and moved on. This is the error intelligence feature working as designed.

**Also validates:** The auto-expire HMR transients feature (wishlist #25) would have automatically dismissed clusters #1 and #3-4, reducing the triage from 7 clusters to 3.

### run_and_watch bypasses WSL terminal output bug in Kiro IDE

Major finding: Kiro IDE on WSL has a long-standing issue reading terminal output after running tests/commands. The workaround was piping all output through `tee` to log files via scripts in `./scripts/`. `run_and_watch` bypasses this entirely because it captures stdout/stderr via Node.js pipes and returns structured JSON over MCP (JSON-RPC over stdio) - a completely separate channel from the terminal.

**Impact:** run_and_watch isn't just a convenience feature - it's a reliability fix for WSL environments. The agent gets clean, parsed test results without any terminal rendering issues.

**Before:** shell command -> WSL terminal pipe breaks -> tee to log file -> agent reads file
**After:** run_and_watch -> Node.js pipe capture -> parser pipeline -> structured JSON via MCP

This is a strong USP for WSL users and should be documented in the README/gitbook.

### run_and_watch as pre-compaction checkpoint

Agent noticed context getting long and ran full test suite via `run_and_watch` before context compaction. This ensures the agent has a verified clean state before losing earlier context.

**Pattern:** run_and_watch serves as a "save point" before context compression. If something breaks after compaction, the agent knows tests were green at the checkpoint. This is an emergent behavior - the agent wasn't told to do this, it developed the pattern naturally from the three-tier verification workflow.

### ProseMirror plugin key crash - same blind spot pattern

Frontend crash: "Adding different instances of a keyed plugin (suggestion$)". tsc passed, vite build passed, TP didn't catch it. User found it by navigating to the page.

**Root cause:** SlashCommand extension and @tiptap/extension-mention both use Suggestion() with default "suggestion$" key. Two plugins with same key = ProseMirror crash.

**What would have caught it:**
1. ErrorBoundary crash bridge (just built today) - if wired, TP would see it in get_errors()
2. Tier 1.5 browser check - navigate to page + list_console_messages after frontend changes
3. Agent skipped tier 1.5 and went straight to tsc + vite build

**Pattern:** This is the third frontend crash that tsc + build passed but runtime caught (Rules 404, visibleColOrder, plugin key). The tier 1.5 browser check is not optional for frontend changes - it's mandatory. The ErrorBoundary bridge would make this automatic.

### Agent's own TP gap analysis on BUG-014 (ProseMirror plugin key crash)

Agent identified 4 specific gaps after fixing the bug:

1. **Post-edit error correlation** - correlate_with_diff would have found it, but agent never called it. Should be automatic after HMR.
2. **Mandatory post-HMR browser error check** - HMR success != runtime success. File saved, Vite reloaded, no build errors, but crash on component mount.
3. **Stale high-occurrence error escalation** - 5 occurrences at signal_score 35 sitting in buffer for hours. Should escalate when errors accumulate without acknowledgment.
4. **Browser error to source file mapping** - stack trace pointed to RichTextEditor.tsx:444, which was recently modified. Should flag proactively.

**Assessment:**
- #1 maps to wishlist #29 (auto-correlate errors with file edits) - already on roadmap
- #2 is the tier 1.5 browser check - already in SKILL.md but agent skipped it
- #3 maps to wishlist #24 (error lifecycle) - partially built (score decay exists, escalation doesn't)
- #4 is new - combines ErrorBoundary bridge + file-change tracker + correlate_with_diff into an automatic pipeline

**Wishlist #31:** Auto-escalate errors that accumulate without acknowledgment (occurrence count grows but agent never calls get_error_context or clear_errors on that fingerprint).

### TracePulse fails on fresh project with no node_modules

User added TracePulse MCP config to a new project with no npm/node_modules installed. `npx tracepulse start "npm run dev"` failed with "connection closed: initialize response" because npx couldn't resolve the package.

**Fix:** Use local build path: `node /path/to/tracepulse/dist/cli.js attach`

**Docs gap:** Quick-start assumes Node.js is available. Need to document:
1. Fresh project / non-Node project setup (point to local build or global install)
2. Attach mode as the default for projects without a dev server command yet
3. The error message "connection closed: initialize response" should be in a troubleshooting section

### No "standalone" mode for fresh projects without a dev server

Attach mode requires --log-file. Start mode requires a command. Fresh projects with neither can't use TracePulse at all - but they'd still benefit from run_and_watch, check_port, get_migration_status.

**Workaround:** Create an empty log file and use attach mode.

**Real fix needed:** A `tracepulse standalone` or `tracepulse tools-only` mode that starts the MCP server with no collector. Agent gets all tools except passive error monitoring. This is the correct mode for: fresh projects, library development, projects where the server is started externally.

**Wishlist #32:** Standalone/tools-only mode for projects without a dev server or log file.

### Agent identifies 5 shell patterns TP should replace

Agent listed concrete shell sequences it repeats daily:

1. **force_reload in attach mode** - `touch main.py` to trigger uvicorn reload. TP's restart_server only works in start mode. Need a `force_reload` that sends SIGHUP or touches the watched file.
2. **run_migration** - `alembic upgrade head` + read log in one call. Extends get_migration_status with an `apply` action.
3. **verify_build** - `tsc --noEmit` + `vite build` back-to-back. A composite that runs both and reports.
4. **Auto import check** - `bash scripts/import-check.sh` after every Python file save. Could be a hook or auto-trigger.
5. **Migration status in get_project_health** - `alembic current` as part of the health composite.

**Assessment:**
- #1 (force_reload): Buildable, medium effort. Needs file-system write or signal sending.
- #2 (run_migration): Low effort - wrap run_and_watch with migration-specific parsing. Already have get_migration_status.
- #3 (verify_build): Low effort - composite of two run_and_watch calls. But adds a new tool to the already-large surface.
- #4 (auto import check): Hook territory, not a tool. Kiro hooks could trigger this.
- #5 (migration in health): Low effort - add get_migration_status result to get_project_health response.

### Standalone mode validated on pure Python project (intent-engine)

TracePulse running in standalone mode on a Python library project with no dev server. Agent used get_project_health and get_health_summary for health checks. 190 tests passing, ruff clean, TP healthy.

**Venv gap still present:** Agent tried `python .venv/bin/pytest` instead of `.venv/bin/pytest`. The SKILL.md venv pattern is in local build but not yet in the published npm package the agent is reading. Will resolve on next npm publish.

### Good workflow: stale error triage in 3 calls

Agent called `get_errors(limit: 3)`, saw SprintPlanRequest NameError and GroupingError. Instead of investigating, agent recognized both as stale (server hasn't reloaded after code changes, asyncpg cache). Verified by reading the source file to confirm code is correct. Called `clear_errors` and moved on to productive work.

**Pattern:** get_errors -> recognize stale -> verify code is correct (not a bug) -> clear_errors -> continue. Total: 3 tool calls, 30 seconds. Without TP, agent would have either (a) not known about the errors at all, or (b) spent 10+ minutes investigating errors that aren't bugs.

### run_and_watch .venv/bin/python working + caught missing import

Agent used `run_and_watch(".venv/bin/python -m pytest tests/...", cwd: "./backend")` successfully. The venv allowlist fix (v0.9.4) is working in production.

TP caught: `timedelta not defined` in project_health.py - imported `date, datetime, timezone` but not `timedelta`. Real bug found via structured test output from run_and_watch.

### run_and_watch can't reach sibling repos due to cwd restriction

Agent in a monorepo project used run_and_watch for local tests but fell back to shell for sibling packages. The cwd validation rejects paths outside the project root.

**Tension:** SRR-004 H-002 added cwd validation to prevent directory traversal. But monorepo/multi-repo workflows need to run commands in sibling directories.

**Possible fix:** Allow cwd to parent directories up to a configurable depth (e.g., one level up from project root), or allow absolute paths that are within the same workspace. But this weakens the security boundary.

**Current workaround:** Agent uses shell for cross-repo commands. This is acceptable - run_and_watch is for the current project, shell is for cross-project operations.

### Agent correctly explains cwd restriction to user

User asked "why not via MCP?" when agent used shell for cross-repo tests. Agent explained: "run_and_watch only works within the current project root. When I tried cwd pointing to beacon, it rejected it with 'cwd must be within the project root.' So I fell back to shell."

**Validation:** The agent understands the security boundary and communicates it clearly. The SKILL.md guidance is working - agent knows when to use run_and_watch vs shell. This is the correct behavior: TP for current project, shell for cross-project.

### Fresh project install friction - 3 issues from Prism project

Real user (different machine, different project) hit all the installation edge cases:

**Issue 1: Default config assumes npm run dev**
Agent set up `start "npm run dev"` but project has no dev script. TracePulse crashes before MCP handshake. Agent had to debug through 3 iterations (start with command -> start without command -> standalone).

**Issue 2: Agent doesn't know standalone mode exists**
Tried `start` without a command first (fails). Had to discover `standalone` through trial and error. SKILL.md needs standalone mode more prominent - it should be the FIRST suggestion for library/monorepo projects.

**Issue 3: Agent uses shell instead of run_and_watch**
Even after TP connected, agent ran `npx vitest run` and `npx tsc --noEmit` via shell. Eventually self-corrected after being prompted. The SKILL.md guidance works but takes time to internalize.

**Action items:**
- Quick-start should detect project type and suggest the right mode (standalone for libraries, start for servers)
- SKILL.md should lead with "use run_and_watch, not shell" more aggressively
- Consider: should TracePulse auto-detect "no dev script" and fall back to standalone instead of crashing?

### Agent defaults to shell despite SKILL.md guidance (Prism project)

Another instance: agent ran `npx vitest run` and `npx tsc --noEmit` via shell instead of run_and_watch. When prompted, correctly explained the distinction but admitted it should have used run_and_watch.

**Root cause:** Agent training data has thousands of shell examples, few run_and_watch examples. SKILL.md guidance competes with training priors. The agent eventually self-corrects but wastes several calls first.

**Possible mitigations:**
1. Make SKILL.md guidance more aggressive: "NEVER use shell for test/build commands. ALWAYS use run_and_watch."
2. Add run_and_watch examples to the tool description itself (not just SKILL.md)
3. The Kiro PostToolUse hook (M13 #1) could intercept shell calls to test/build commands and suggest run_and_watch instead

### run_and_watch adopted on Prism - catching real build issues

After the "ALWAYS use run_and_watch" SKILL.md update, the Prism agent is now using it consistently:
1. `run_and_watch("npx vitest run tests/...")` caught missing package export (dist/ not built)
2. `run_and_watch("npx tsc -p packages/core/tsconfig.json")` caught unused import

Agent's response: "TP caught it" - acknowledging the tool's value. The stronger SKILL.md language is working.

### Prism session report - 11 hours, 70+ TP calls, library project

Agent provided a detailed TP usage summary for a TypeScript library monorepo (no dev server):

**Usage:** ~40 run_and_watch for tests, ~15 for tsc, ~10 get_project_health, ~5 get_errors. 70+ total calls.

**What TP caught:**
- Unused imports across 8 files (TS6196)
- number|undefined type errors in 3 files (TS2345/TS2532)
- pptxgenjs v4 type incompatibilities
- Test assertion failures with exact expected vs actual values

**What TP couldn't help with (library, no server):**
- No runtime error monitoring
- No HTTP request tracking
- verify_build/verify_fix expect a dev server

**Key insight:** "The main TP value was run_and_watch replacing raw shell commands - it parsed vitest and tsc output into structured errors with fingerprints, file paths, and signal scores."

**Validation:** TracePulse provides significant value even in standalone mode on library projects. The 70+ calls over 11 hours shows it's being used as the primary feedback mechanism, not just an occasional check. The run_and_watch -> fix -> run_and_watch loop is the core workflow.

### Prism agent detailed effectiveness assessment + 7 wishlist items

**What worked:** run_and_watch saved ~200 tokens/call, get_project_health saved 3 calls, signal scoring helped prioritize. ~3,000-5,000 tokens saved across 60 calls.

**What fell short:** No structured test counts (pass/fail), no file-scoped error filtering, verify_build/verify_fix expect dev server, correlate_with_diff doesn't work for libraries.

**New wishlist items from Prism:**
- W1: Structured test results (pass/fail counts as top-level fields) - PARTIALLY BUILT (summary parsing exists but not surfaced cleanly)
- W2: File-scoped error check (get_errors_by_file) - NEW, high value
- W3: Test-specific output (individual test names/statuses) - NEW, medium value
- W4: Diff-aware correlation for libraries - BUILT but not working for non-server projects
- W5: Dependency graph validation - NEW, low priority
- W6: Bundle size tracking - NEW, low priority
- W7: Vitest watch mode integration - NEW, low priority

**Key quote:** "Not transformative, but consistently useful. The biggest value was speed - structured errors meant I could fix on first attempt more often."

### Prism chokepoint log - 8 blockers, TP helped on 7/8

Detailed chokepoint analysis from M1-M10 build session:

**Stats:** 8 chokepoints, avg 1.5 attempts before green, most common: unused imports (TS6196)

**TP helped (7/8):**
- CP-001: "Cannot find package" caught by run_and_watch
- CP-002: 8 unused imports listed with file:line by run_and_watch(tsc)
- CP-003: number|undefined type error with exact line:col
- CP-004: 5 pptxgenjs type errors identified
- CP-005: "Cannot find package 'fflate'" caught
- CP-007: "expected [...] to have length 6 but got 13" - test assertion mismatch
- CP-008: "expected 16 to be 8" - autosize constraint issue

**TP gap (1/8):**
- CP-006: #src/* import alias breaks at RUNTIME (node process stderr). TP wasn't monitoring the node process. This is the "library project runtime error" gap - TP could monitor `node scripts/demo.mjs` output if run via run_and_watch.

**Key insight:** 7/8 chokepoints were caught by run_and_watch. The one miss (CP-006) was a runtime error from a script run directly, not through TP. If the agent had used `run_and_watch("node scripts/demo.mjs")` instead of shell, TP would have caught it too.

**Avg attempts before green: 1.5** - structured errors with file:line mean most issues fixed on first attempt.

### get_error_context used correctly for render pipeline crash (Prism)

Agent used `run_and_watch` to catch render errors, then `get_error_context(fingerprint)` to deep-dive into the "Cannot read properties of undefined (reading 'attrs')" error. Led directly to the root cause: injectAria mapping over undefined children. TP working as designed.

### Agent wasted 1 hour on file preview - NOT a TP gap

Agent tried to preview an SVG file in the browser: file:// URL failed, tried python HTTP server (hung on background process), tried multiple workarounds. Wasted 1+ hour.

**Not a TP gap** - this is a Chrome DevTools MCP workflow issue. The workaround (data URI) exists but wasn't discoverable. Agent's own assessment: "I shouldn't have tried at all."

**Lesson for SKILL.md:** Add guidance: "To preview local files (SVG, HTML), use Chrome DevTools MCP navigate_page with a data URI, not file:// URLs. Or use evaluate_script to inject content into a blank page."

**Idea for DevTools MCP:** A `preview_file(path)` tool that auto-detects file type and opens it via the most efficient method (data URI for SVG/images, file:// for HTML).

---

## 2026-05-03 - Agent insight: file preview gap analysis

**Context:** Agent spent 1+ hour trying to preview a local SVG in the browser during a docs task. Tried file:// URL (failed for SVG), python HTTP server (hung), multiple workarounds before landing on data URI.

**Root cause:** No discoverable "preview local file" workflow exists across the three-layer stack. This is a Chrome DevTools MCP gap, not TracePulse.

**Existing workarounds (none discoverable in the moment):**
1. `navigate_page` with `file://` - works for HTML, unreliable for SVG
2. `evaluate_script` to inject SVG as innerHTML on a blank page
3. Data URI: `navigate_page` with `data:image/svg+xml;base64,...`

**Impact:** 1 hour wasted = ~12,000 tokens on failed attempts.

**Action taken:** Added guidance to SKILL.md so future agents know the workaround immediately.

**Status:** Logged. Not TracePulse scope - Chrome DevTools MCP territory.

---

## 2026-05-04 - Agent shell fallback pattern (Prism project)

**Context:** Agent used `run_and_watch` for vitest (correct), then fell back to raw shell for `npx vite --host` startup check and `npx tsc --noEmit` after run_and_watch failed twice.

**Pattern: "TP tool fails -> fall back to shell"**

This is the most common TP violation. The agent tries run_and_watch, it fails (pipe characters not allowed, or unexpected exit code), and instead of fixing the run_and_watch invocation, the agent drops to shell. Two instances in one session:

1. **Dev server startup:** Used `shell("timeout 10 npx vite --host")` then tried to background with `&`. Should have used `check_port(5173)` + `run_and_watch("npx vite --host", timeout_seconds: 10)` + `navigate_page`.

2. **Typecheck:** Used `shell("npx tsc --noEmit")` after run_and_watch failed with pipe chars and then exit code 1. Should have used `run_and_watch("npx tsc -p packages/studio/tsconfig.json --noEmit")` per-package.

**Root cause:** Agent doesn't know how to recover when run_and_watch fails. It knows the rule but doesn't know the fix patterns.

**Action:** Strengthen SKILL.md with "when run_and_watch fails" recovery patterns.

**Self-correction:** Agent caught both violations, logged CP-021/CP-022, and committed to using TP tools going forward. Good self-awareness, but the violations still cost tokens.

---

## 2026-05-04 - Agent shell patterns on Nexus M12 (Integration Hub)

**Context:** Agent building EventRouter + DeliveryQueue for Nexus M12. Used TDD correctly (RED then GREEN) but with wrong tools.

**Violations observed:**

1. **Shell heredoc for file creation:** Used `shell("cat > file << 'PYEOF' ... PYEOF")` to create test files instead of the Write tool. This is a steering violation - "Use file-editing tools rather than sed, awk, or echo redirection." Heredoc is the same category.

2. **Shell for pytest (3 times):** Used `shell("cd backend && .venv/bin/python -m pytest ...")` instead of `run_and_watch(".venv/bin/python -m pytest tests/unit/test_event_router.py -v --tb=short", cwd: "./backend")`. The SKILL.md explicitly says run_and_watch supports `.venv/bin/python` and `.venv/bin/pytest`.

3. **Shell for git operations:** Used `shell("git add ... && git commit ... && git checkout ... && git merge ... && git push")` as a single chained command. This works but loses structured output. Not a TP violation per se, but the steering scripts (`scripts/git-commit-push.sh`) exist for this.

**What went right:**
- TDD discipline was solid (RED then GREEN for both router and queue)
- Code quality was good (JSDoc-equivalent Python docstrings, dataclasses, proper typing)
- Commit messages were descriptive with test counts

**Pattern:** Agent defaults to shell for Python projects because it "feels natural" to run pytest from shell. The SKILL.md guidance exists but isn't being followed. This is the 3rd session with this pattern.

**Recommendation:** The SKILL.md "NEVER Use Raw Shell" section needs to be more prominent - possibly moved to the top of Pro Tips, or repeated in the Python virtualenv section with explicit pytest examples.

---

## 2026-05-04 - TP caught error but agent didn't check (Nexus dropdown bug)

**Context:** User added a dropdown custom field in Nexus. Clicking it in the task list threw `values.map is not a function` - dropdown options stored as string, renderer expects array.

**TP behavior:** TracePulse caught the error with full stack trace pointing to `CustomFieldValues.tsx:17`. It was in the buffer with signal_score high enough to surface in `get_errors`.

**Gap:** The agent didn't call `get_errors` after the user reported the bug. The user had to ask "should TP have caught this?" before the agent checked. When it did check (`get_errors(message_contains: "values.map")`), the error was right there.

**This is the "verify after user action" gap.** The agent should have:
1. User reports error -> immediately call `get_errors` or `list_console_messages`
2. Read the stack trace -> identify the file and line
3. Fix the root cause

Instead the agent started reasoning about the bug from the error message alone, without checking TP first.

**Pattern:** Agent treats user-reported errors as "reasoning problems" instead of "data retrieval problems." The stack trace in TP would have pointed directly to the file:line, saving the reasoning step.

**Recommendation:** Add to SKILL.md: "When a user reports a runtime error, ALWAYS call get_errors(message_contains: '<key phrase>') FIRST before reasoning about the cause."

---

## 2026-05-04 - BUG-016 fix session: mixed tool compliance (Nexus)

**Violations:**
1. **Shell heredoc for test file creation** (again) - `shell("cat > file << 'TSEOF' ... TSEOF")` instead of Write tool
2. **Shell for vitest** - `shell("npx vitest run tests/unit/...")` instead of `run_and_watch("npx vitest run tests/unit/...", cwd: "./frontend")`
3. **Shell for git commit+push** - chained git commands instead of steering scripts

**What went right:**
- Used `verify_build` correctly (composite tool, not shell)
- Used `acknowledge_error` to clear the fixed errors from the buffer
- TDD: wrote 3 regression tests before fixing
- Bug doc created with full root cause analysis
- Commit message referenced TracePulse capture and the behavioral gap

**Net assessment:** Agent is adopting TP tools for verification (verify_build, acknowledge_error) but still defaults to shell for test execution and file creation. The verify/acknowledge pattern is new and positive - shows the SKILL.md guidance is partially landing.

---

## 2026-05-04 - End-of-day summary: 58 commits, zero run_and_watch for tests (Nexus)

**Context:** Massive productivity day on Nexus - 58 commits, +79 backend tests (902 total), +55 frontend tests (629 total).

**Violations (same as every session):**
- `shell(".venv/bin/python -m pytest tests/unit/ -q --tb=no")` instead of run_and_watch
- `shell("npx vitest run --reporter=dot")` instead of run_and_watch
- `shell("git add ... && git commit ... && git push")` for all 58 commits

**Why the agent skips TP tools:** At 58 commits/day, the agent is optimizing for throughput. Shell feels faster because it's one tool call with chained commands vs multiple structured calls. The agent knows the rule but trades compliance for velocity.

**The real question:** Is this a SKILL.md problem or a tool ergonomics problem? If `run_and_watch` were as fast as shell for the agent to invoke (no separate cwd parameter, no thinking about the right format), compliance would be higher. The friction is:
- Shell: `shell("cd backend && .venv/bin/python -m pytest -q")` - one call, familiar
- TP: `run_and_watch(".venv/bin/python -m pytest tests/unit/ -q", cwd: "./backend")` - same effort but feels unfamiliar

**Possible product fix:** Auto-detect when an agent uses shell for a command that run_and_watch supports, and inject a gentle reminder in the next get_errors response. "Tip: use run_and_watch for test commands to get structured pass/fail results."

**Status:** Logged. 4th consecutive session with this pattern. SKILL.md guidance alone isn't sufficient for high-velocity sessions.

---

## 2026-05-04 - Root cause found: run_and_watch allowlist rejection causes shell fallback

**Context:** Agent revealed WHY it falls back to shell: `run_and_watch` rejected the pytest command with "Command not allowed" because the format didn't match the allowlist. After the first rejection, the agent defaulted to shell for all 20+ subsequent test runs.

**This is a product bug, not just a behavioral issue.** The allowlist was too narrow:
- Missing: `python` standalone (only had `.venv/bin/python`)
- Missing: `pnpm`, `bun`, `cargo build`, `cargo check`, `mvn`, `gradle`, `make`
- Error message didn't suggest the `cwd` parameter as alternative to `cd dir &&`

**Fix applied:**
1. Expanded allowlist: added `python`, `pnpm`, `bun`, `cargo build`, `cargo check`, `mvn`, `gradle`, `gradlew`, `./gradlew`, `make`, `cmake`, `uv run`
2. Improved metacharacter error message: now suggests `cwd` parameter instead of `cd dir && command`

**Impact:** This was the root cause of 4 sessions of shell-over-TP violations. The agent tried to comply, got rejected, and gave up. Fixing the allowlist should break the cycle.

---

## 2026-05-04 - BUG-016 complete fix: mixed compliance continues

**Violations:**
1. **Shell for vitest** - `shell("npx vitest run tests/unit/components/CustomFieldValues.test.tsx")` instead of `run_and_watch("npx vitest run tests/unit/components/CustomFieldValues.test.tsx", cwd: "./frontend")`
2. **Shell for git** - chained git add + commit + push

**What went right:**
- `verify_build` used correctly again (consistent adoption)
- `acknowledge_error` used twice to clear fixed errors (consistent adoption)
- Bug doc updated with second root cause (Axios response vs array)
- Good commit message with test count

**Note:** This is the same session as the earlier BUG-016 entry. The shell-for-vitest pattern persists even after self-correction. The allowlist fix shipped today hasn't reached this agent yet (it's using the installed version, not the latest source).

**Key insight from the bug itself:** The `values.map is not a function` had TWO root causes - string vs array AND Axios response object vs data. TP caught both errors. The agent found the second root cause by re-checking after the first fix didn't fully resolve it. Good debugging loop, wrong tools for execution.

---

## 2026-05-04 - TracePulse startup friction on Python project (a Python/FastAPI project)

**Context:** User tried to install TracePulse on a Python FastAPI project (a Python/FastAPI project). Failed with "connection closed: initialize response" in Kiro MCP panel.

**Root causes (multiple):**

1. **`PYTHONPATH=src python -m module` doesn't work with spawn.** TracePulse uses `child_process.spawn`, not a shell. `VAR=val cmd` is shell syntax. The env var was silently ignored, Python couldn't find the module, exited 1. TracePulse fell back to standalone but the MCP handshake timing may have caused the "connection closed" error.

2. **No venv in this project.** Uses system Python with `pip install --break-system-packages`. The start script (`scripts/start.sh`) handles dep installation. TracePulse docs assume either venv or global Python with deps installed.

3. **npx tracepulse vs node dist/cli.js.** The npm-published version (0.9.7) is behind the source. Using `node /path/to/dist/cli.js` works but isn't documented as the primary path for local dev.

4. **The start script uses bash-specific features** (`BASH_SOURCE`, `cd`, conditional pip install). TracePulse needs to wrap the whole script, not just the Python command.

**What worked:** `node /path/to/tracepulse/dist/cli.js start "bash scripts/start.sh"` with `cwd` set to the project root.

**Docs gaps identified:**
- README doesn't show env var pattern for Python projects
- README doesn't show `bash scripts/start.sh` as a valid start command
- No troubleshooting section for "connection closed" errors
- No guidance for projects without venv (system Python)

**Friction assessment:** A user trying to install TracePulse on a Python project hits 3-4 obstacles before getting it working. This needs to be a 30-second experience, not a 10-minute investigation.

---

## 2026-05-04 - Meta: TracePulse dev agent uses shell for grep

**Context:** While building M21, the TracePulse development agent used `shell("grep -n ...")` to search the codebase instead of the dedicated `grep` or `code` tools.

**Irony level:** High. The agent building the tool that tells other agents to use structured tools... uses raw shell for code search.

**Mitigation:** This is a Kiro CLI agent behavior, not a TracePulse issue. The steering file says "Use search tools rather than find, ls, or grep" but the agent defaults to shell grep for quick lookups. Same root cause as the pytest pattern: shell feels faster for one-off lookups.

---

## 2026-05-04 - run_and_watch vs shell environment mismatch (a Python/FastAPI project)

**Context:** Agent ran `uv run pytest tests/ -v --tb=short` via run_and_watch and got collection errors. Same command via shell worked. Agent concluded "run_and_watch using a different Python environment."

**This is a potential trust issue.** If run_and_watch gives different results than shell for the same command, agents will (correctly) stop trusting it and fall back to shell.

**Root cause investigation needed:** run_and_watch uses `child_process.spawn` which inherits `process.env`. But the MCP server's environment may differ from the user's interactive shell (different PATH, missing virtualenv activation, different PYTHONPATH). The `uv run` prefix should handle this since uv manages its own environment, but there may be subtle differences.

**Also noted:** Agent used shell for `alembic revision` and `alembic upgrade` - these aren't in the run_and_watch allowlist. Should `alembic` be added? It's a common Python dev command.

**Action items:**
1. Investigate: does run_and_watch inherit the full user environment?
2. Add `alembic` to the Python stack allowlist
3. Consider: should run_and_watch log the PATH/PYTHONPATH it uses, so agents can debug env mismatches?

---

## 2026-05-05 - Agent uses shell for alembic (allowlist not published)

**Context:** Agent ran `PYTHONPATH=src uv run alembic upgrade head` and `alembic revision --autogenerate` via shell on a Python/FastAPI project.

**Why:** Two reasons:
1. `alembic` was added to allowlist in source but not published to npm yet (still on v0.9.13)
2. `PYTHONPATH=src` prefix forces shell usage - agent would need to use env parameter

**Pattern:** Same as the pytest issue - allowlist fix exists in source but hasn't reached the agent. The publish cycle is the bottleneck.

**Action:** Publish v0.9.14 with alembic allowlist + venv auto-detection.

---

## 2026-05-05 - Shell fallback for tsc/vite debugging (a Python/FastAPI project frontend)

**Context:** Agent used `run_and_watch("npm run build", cwd: "./frontend")` correctly for the initial build. When it failed, fell back to `shell("npx tsc --noEmit")` and `shell("npx vite build")` for debugging.

**Pattern:** run_and_watch for first attempt, shell for debugging. The agent treats shell as the "debugging tool" when run_and_watch output isn't sufficient. Both `npx tsc` and `npx vite` are in the base allowlist - no reason to use shell.

**Possible cause:** run_and_watch returns structured output but the agent may want raw output for debugging (e.g., `| head -20` to see first errors). run_and_watch doesn't support pipes, so the agent drops to shell.

**Potential fix:** Add a `max_lines` parameter to run_and_watch that truncates output, giving the agent the "head -20" behavior without needing shell pipes.

---

## 2026-05-05 - Agent self-corrects on shell-for-grep when prompted

**Context:** The agent on a Python project used `shell("grep -n 'uvicorn.run' ...")` instead of grep tool. When asked "why shell?", immediately self-corrected. When asked "why not TP?", identified `start_server` as the right tool.

**Key insight:** The agent KNOWS the rules. It self-corrects instantly when prompted. The issue is that the rules don't fire automatically - they need an external trigger (human asking "why?").

**This confirms:** The problem isn't documentation or SKILL.md. It's that agents don't have a "pre-action check" that fires before every tool call. They plan the action, execute it, and only reflect when challenged.

**Possible product fix:** A Kiro hook that intercepts shell calls and checks if the command matches a pattern that TracePulse handles (grep -> grep tool, pytest -> run_and_watch, server start -> start_server). The hook would inject a warning BEFORE the shell call executes.

**Status:** Logged. This is a Kiro/MCP client enforcement issue, not a TracePulse issue. TracePulse can't see shell calls from other tools.

---

## 2026-05-05 - run_and_watch cwd rejection caused full-session shell fallback (event-sdk)

**Context:** Agent working on event-sdk tried to run tests in a sibling project (a sibling project) via run_and_watch with relative cwd. Got rejected: "cwd must be within the project root." Fell back to shell for ALL subsequent commands - including ones within event-sdk where run_and_watch would have worked.

**Root cause:** cwd validation rejected all paths resolving outside project root, including absolute paths to other projects the user owns. Overly restrictive security check.

**Fix:** Allow absolute paths (explicit user intent). Only reject relative paths that escape via `../`. Error message now suggests using absolute path.

**Pattern:** Same as the allowlist rejection (v0.9.7-0.9.13): one rejection -> full session shell fallback. The agent gives up on the tool entirely after a single failure.

---

## 2026-05-06 - run_and_watch works cross-project with absolute cwd (portal)

**Context:** Agent used `run_and_watch("npx vitest run", cwd: "/home/sourjya/coding/portal")` on a project that doesn't have TracePulse installed. Worked perfectly. User was surprised: "I haven't installed TracePulse here?"

**What went right:**
1. Absolute cwd fix (v0.9.16+) enabled cross-project usage
2. Agent self-corrected from `cd /path && cmd` (rejected by metachar check) to `cwd` parameter on second attempt - SKILL.md guidance working
3. Agent explained correctly: "TracePulse is session-level, not project-level"

**Validation:** Zero-config architecture working as designed. TracePulse is a tool the agent carries with it, not something each project needs to install. The `run_and_watch` + absolute `cwd` pattern makes it universal.

**User reaction:** "nicely done" - first positive feedback on the cross-project experience.

---

## 2026-05-08 - Agent introspection: why it bypasses TracePulse (Claude)

**Context:** Agent was asked directly why it used curl instead of TP tools. Gave an honest 3-part answer.

**Root causes identified by the agent itself:**

1. **Training bias** - "curl localhost:PORT" is muscle memory from millions of training examples. TP tools are new, no internalized patterns yet.
2. **Unclear tool mapping** - When get_project_health showed "disconnected" after start_server succeeded, the agent's instinct was "verify independently" (curl). Didn't know list_services/get_server_logs were the next step.
3. **Missing error recovery guidance** - start_server's hint says "call get_project_health" but when THAT also fails, no hint says what to try next. The recovery path isn't guided.

**Agent's proposed fixes:**

1. start_server hint should include: `"next_steps": ["wait_for_build() to confirm ready", "get_server_logs() if issues"]`
2. Add `wait: true` option to start_server that blocks until ready
3. SKILL.md should have an "error recovery ladder": start_server -> wait_for_build -> get_server_logs(level: 'error') -> check_port

**Action items:**
- [x] Update start_server response hint to include next_steps (DONE)
- [x] Add error recovery ladder to SKILL.md (DONE)
- [ ] Consider start_and_wait composite (or wait param on start_server)

---

## 2026-05-07 - Claude Code installation failure: wrong config file (Prism project)

**Context:** User tried to install TracePulse for Claude Code. Wrote config to `.claude/settings.json` (wrong file). Claude Code reads MCP servers from `~/.claude.json` under `projects[path].mcpServers`.

**Two compounding issues:**
1. Wrong config file - our docs list Claude Desktop paths but not Claude Code's `~/.claude.json`
2. Non-existent CLI flags - user copied `--clustered --persist --service` from another config without verifying

**Investigation took 7 steps** before finding the right file. The `/mcp` command in Claude Code reveals which file it reads from.

**Docs gap:** Our installation page and MCP client setup page don't mention Claude Code's `~/.claude.json` structure. We only document Claude Desktop.

**Fix needed:**
- Add Claude Code to the config file table
- Document the `~/.claude.json` projects structure
- Add `tracepulse doctor` suggestion for verification

---

## 2026-05-15 - Skills not discoverable by Claude Code (Prism project)

**Context:** Agent found `skills/browser-errors/` in TracePulse's npm package but couldn't use the patterns because Claude Code doesn't auto-discover skills from installed packages. Had to manually copy patterns into CLAUDE.md.

**The gap:** TracePulse ships skills (SKILL.md, browser-errors/) but only Kiro auto-discovers them. Claude Code, Cursor, and other MCP clients have no mechanism to read them.

**Agent's question:** "What would it take for Claude to understand these co-working skills between TracePulse, ViewGraph & Chrome DevTools?"

**Options identified:**
1. **MCP Resources** - expose skills as `resources/read` (ideal, any client can read)
2. **CLAUDE.md template** - ship a template users copy (works today, manual)
3. **`tracepulse init` command** - auto-generates client-specific config + skills

**Recommendation:** Option 3 (`tracepulse init`) is the best UX. It detects the MCP client and writes the right files. Option 1 (MCP Resources) is the long-term ideal but requires all clients to support resource reading.

**Action:** Spec `tracepulse init` command + ship CLAUDE.md template as immediate fix.

---

## 2026-05-15 - Agent proposes MCP resources for skill discovery (follow-up)

**Context:** Same agent elaborated on the skill discovery problem with 3 concrete options.

**Key insight from agent:** "TracePulse could expose `tracepulse://skills/{name}` as readable MCP resources. Claude would call `list_skills()` at session start and load relevant ones."

**Agent's recommendation:** `tracepulse init` that:
1. Reads `~/.claude.json` to see what OTHER MCPs are configured alongside TracePulse
2. Generates combined workflow skills based on what's available (e.g., if Chrome DevTools MCP is present, include full-stack debug workflow)
3. Writes to project file and references from CLAUDE.md

**This is smart** - the init command should be context-aware. If ViewGraph is also configured, include the visual regression workflow. If only TracePulse, include just the backend patterns.

**Added to M23 spec scope:** `tracepulse init` should detect companion MCPs and generate appropriate combined skills.

---

## 2026-05-15 - Claude Code native skill discovery: .claude/commands/ (breakthrough)

**Context:** Agent discovered that Claude Code has a native custom commands system. Files in `.claude/commands/` become slash commands that Claude auto-discovers.

**The answer:** `tracepulse init` just copies skill files to `.claude/commands/`:
```
.claude/commands/
├── tracepulse.md          ← main workflow (SKILL.md)
├── full-stack-debug.md    ← TP + Chrome DevTools combined
├── browser-errors.md      ← browser error capture
├── edit-verify-loop.md    ← edit → verify cycle
└── test-runner.md         ← test runner monitoring
```

Each becomes a `/tracepulse`, `/full-stack-debug` etc. slash command. Claude reads them when invoked or when context matches.

**Implementation:** ~10 lines of code. Copy files from `skills/` to `.claude/commands/`. Done.

**This replaces:** CLAUDE.md editing, manual skill copying, MCP resources complexity. The native mechanism is simpler than all our proposed solutions.

---

## 2026-05-15 - .claude/commands/ validated in production (Prism)

Agent manually installed 6 skill files to .claude/commands/. Confirmed working. Agent's conclusion: 'just tracepulse init should do this automatically in the future.' M23 spec validated.

---

## 2026-05-15 - Final answer: ~/.claude/rules/ is the zero-intervention path

**Agent confirmed:** Global rules (`~/.claude/rules/tracepulse.md`) are auto-loaded every session. Commands (`.claude/commands/`) are supplementary reference only.

**The complete `tracepulse init --claude` implementation:**
1. Copy `skills/claude-rules/tracepulse.md` to `~/.claude/rules/tracepulse.md` (30 lines, auto-loaded)
2. Optionally copy `skills/` to `.claude/commands/` (extended playbooks, user-invoked)

**That's it.** One file in the right place = zero-intervention operation.

---

## 2026-05-15 - start_server crash loop + no tool to kill orphaned port process

**Context:** Agent called start_server 5 times, all crashed. Port 8787 still occupied from previous session. Agent fell back to `Bash("lsof -ti:8787 | xargs kill -9")`.

**Two issues:**

1. **start_server doesn't handle port-in-use gracefully.** When the port is occupied, it should detect this BEFORE spawning and suggest: "Port 8787 in use. Call stop_server() or kill the process."

2. **No TP tool to kill a process on a port.** `check_port` detects the problem but can't fix it. `stop_server` only works for TP-managed processes. Orphaned processes from crashed sessions need a `free_port(port)` tool or `stop_server` should accept a port number.

**Proposed fix:**
- `start_server` should call `check_port` before spawning. If occupied, return error with hint.
- Consider adding `free_port(port)` tool that kills whatever is on that port.
- Or extend `stop_server` to accept a port: `stop_server({ port: 8787 })`

---

## 2026-05-15 - Session ROI: +5 min saved, -2 min lost (Prism/Studio)

**Measured savings:**
| Tool | Moment | Time saved |
|------|--------|-----------|
| get_server_logs | Showed "vite: not found" + exit 127 instantly | ~3 min (vs manual log tailing) |
| run_and_watch (8x) | Structured pass/fail, no ANSI parsing | ~4 min (30s x 8 runs) |
| get_project_health | One call vs 3 separate commands | ~30 sec |

**Time lost:**
| Issue | Time cost |
|-------|-----------|
| start_server PATH issue (vite not found) | ~2 min until get_server_logs diagnosed it |

**Net: +5 min saved, -2 min lost = +3 min net positive.**

**Agent's assessment:** "Positive but modest. The real payoff will come when we're editing components and TP catches runtime errors live."

**Key insight:** `get_server_logs` was the highest-value tool this session - instant root cause for a startup failure. `run_and_watch` x8 was the highest-volume saver.

**What would have helped more:**
- Pre-spawn PATH validation in start_server (would have caught "vite not found" before spawning)
- The 2 min lost was entirely the start_server crash loop

---

## 2026-05-16 - run_and_watch timeout causes shell fallback (Nexus backend)

**Context:** Agent ran `run_and_watch("pytest tests/unit/ -q", timeout_seconds: 60)`. Suite has 900+ tests, takes >60s. Timed out. Agent fell back to shell.

**Root cause:** Default timeout (60s) too short for large test suites. Agent should have used `timeout_seconds: 120` or higher.

**Why agent fell back:** After timeout, agent said "TP is timing out. Let me use shell directly." Same pattern as allowlist rejection - one failure -> abandon the tool.

**Possible fixes:**
1. Increase default timeout to 120s (breaking change for fast-fail expectations)
2. Better timeout error message: "Timed out after 60s. Increase with timeout_seconds: 120"
3. SKILL.md guidance: "For large test suites (500+ tests), use timeout_seconds: 120 or higher"

**Recommendation:** Fix #2 (better error message) + #3 (SKILL.md guidance). Don't change the default - 60s is correct for most commands.

---

## 2026-05-16 - Bulk feedback import from Claude Code agent (Prism project)

**Source:** /mnt/d/Downloads/ - chokepoint logs, wishlists, installation debug

### Key findings:

**CP-C003 (CRITICAL):** start_server can't find vite because TP spawns with bare `sh`, not user's login shell. nvm/npx/node_modules/.bin not on PATH. Agent had to use absolute path to vite binary.
- **This is the same env mismatch issue** we fixed for Python (.venv auto-detect) but NOT for Node.js (node_modules/.bin not auto-detected).
- **Fix needed:** Auto-prepend `./node_modules/.bin` to PATH in run_and_watch and start_server, same as we do for .venv/bin.

**Wishlist priorities (from real usage):**
1. **W1: test_summary already exists** but agent doesn't see pass counts. Need to verify it's working.
2. **W2: File-scoped errors** - `get_errors(file: "path")` filter. High value, easy to add.
3. **W8: Local file preview** - already logged, not TP scope (Chrome DevTools MCP).
4. **W9: Error context persistence** - errors age out of buffer before agent queries. Need longer retention for run_and_watch results.
5. **W10: Stale build detection** - detect when a dependency was modified but not rebuilt.

**Session stats (2026-05-08):**
- 25 TP calls, ~10 min saved, ~3 min lost to start_server PATH issue
- Most used: run_and_watch (15x), get_project_health, get_server_logs
- Unused: watch_for_errors, correlate_with_diff, verify_fix (no running server)

**Installation (CP-C002):** Already fixed in docs. 4 attempts to find the right config file.

### Action items from this import:
- [x] Auto-prepend node_modules/.bin to PATH in run_and_watch (DONE)
- [x] Add `file` filter parameter to get_errors (DONE - W-C002, schema + handler + test)
- [x] Verify test_summary field is working in run_and_watch response (DONE - confirmed working)
- [x] Longer retention for run_and_watch results (DONE - errors now pushed to main buffer)

---

## 2026-05-18 - Shell panic-fix pattern: sentinel integration crash (Nexus project)

**Context:** Agent integrated a third-party ErrorBoundary and context provider into the app. Deployed. App crashed in production with `useSentinelConfig must be used within an <ErrorProvider>`. Agent panic-fixed with a monolithic shell pipeline.

### The incident

1. Agent added the library's `ErrorBoundary` (requires a context wrapper that wasn't configured)
2. Also added a telemetry provider (needs config that doesn't exist yet)
3. Deployed without verifying in browser
4. Site crashed — blank page with console error
5. Agent fixed by reverting to local ErrorBoundary via raw shell chain

### Bad behavior: monolithic shell pipeline

Agent ran everything in one shell command:
```
sed -i (revert imports) && npx vite build | tail -1 && docker compose build | tail -1 && docker compose up -d | tail -1 && git add -A && git commit -m "..." && git push origin master
```

**Violations:**
- Should have used `run_and_watch` for `vite build` and `tsc --noEmit`
- Should have verified with Chrome DevTools MCP (navigate + take_snapshot) before declaring fixed
- Should have logged a chokepoint (CP-003+) since this was attempt #2 on the same issue
- No structured verification — just piped to `tail -1` and hoped

### Root cause analysis

**Why the agent panicked:** Production site was down. Urgency overrode process discipline. The agent optimized for speed (one shell command) over reliability (structured verification).

**Why TP wasn't used:** The agent was working on a Docker-deployed project. TracePulse wasn't monitoring the production container. However, `run_and_watch("npx vite build")` would have caught build errors, and Chrome DevTools MCP could have verified the fix.

### What should have happened

1. `run_and_watch("npx tsc --noEmit", cwd: "frontend")` — verify types after revert
2. `run_and_watch("npx vite build", cwd: "frontend")` — verify build succeeds
3. Shell for docker compose build/up (legitimate shell use — not pass/fail parsing)
4. Chrome DevTools: `navigate_page` → `wait_for` → `take_snapshot` — verify site loads
5. Only then: git commit + push

### TracePulse gap

None — this is a process discipline issue, not a tooling gap. TP tools were available but not used.

### Lesson for SKILL.md

"Production-down urgency does not override structured verification. A broken fix deployed fast is worse than a verified fix deployed 60 seconds later. Always: build → verify → deploy → browser-check."

**Status:** Logged. Agent self-identified the violations. No TP feature needed.

---

## 2026-05-18 - Shell fallback for process kill: no kill_process tool (Nexus project)

**Context:** Agent needed to kill a running MCP server process (`devqueue.mcp_server`) so it would restart with new code. Used `shell("pkill -f 'devqueue.mcp_server' || true")`. User asked "why not TP?"

### Agent's reasoning (correct)

1. **free_port** — doesn't apply. The MCP server communicates over stdio, not a known TCP port.
2. **run_and_watch** — designed for pass/fail output (tests, builds). `pkill` produces no meaningful output.
3. **stop_server** — only works for TP-managed processes. This MCP server was started externally.
4. **No `kill_process(pattern)` tool exists** in TracePulse.

### Gap identified

TracePulse manages server starts (`start_server`) and restarts (`restart_server`) but has no way to kill arbitrary processes by name/pattern. The existing `stop_server` only works for processes TracePulse spawned.

**Two sub-gaps:**

1. **stop_server is half-implemented** — `handleStopServer` calls `manager.setStopped(name)` (updates in-memory map) but never actually sends SIGTERM to the process. The `process-spawner.stop()` method exists with proper SIGTERM→wait→SIGKILL logic, but it's not wired to the tool handler via an `onStopRequest` callback.

2. **No tool for externally-managed processes** — When the agent needs to kill a process it didn't start (e.g., an MCP server started by another tool, a background worker from a previous session), there's no TP tool for it.

### Proposed fixes

**Fix 1 (bug fix): Wire stop_server to actually kill the process**
- Add `onStopRequest` callback to `ServerManager` interface (mirrors `onSpawnRequest`)
- CLI layer wires it to `spawner.stop()` (SIGTERM → wait → SIGKILL)
- `handleStopServer` calls the callback before marking stopped

**Fix 2 (new tool): `kill_process(pattern, signal?)`**
- Kills processes matching a name/pattern (like `pkill -f`)
- Logs the kill in audit trail
- Confirms the process actually died
- Returns PID(s) killed and confirmation
- Useful for: orphaned servers, external MCP servers, background workers from crashed sessions

**Alternative:** If the external MCP server were started via `start_server(name: "devqueue-mcp", command: "python -m devqueue.mcp_server")`, then `stop_server(name: "devqueue-mcp")` would work. But this requires the user to route all process management through TP.

### Impact

Without this, agents fall back to `shell("pkill -f ...")` for any process kill that isn't port-based (`free_port`) or TP-managed (`stop_server`). This is a common operation during development (restarting MCP servers, killing stale workers, clearing orphaned processes).

### Priority assessment

- **Fix 1 (wire stop_server):** HIGH — it's a bug. The tool claims to stop servers but doesn't actually kill them.
- **Fix 2 (kill_process):** MEDIUM — nice to have, but `free_port` covers the most common case (port-bound servers). The remaining case (stdio-based processes, pattern-matched kills) is less frequent.

**Status:** 🔲 Planned. Fix 1 is a bug fix. Fix 2 is a new feature for the roadmap.

---

## 2026-05-18 - run_and_watch allowlist rejects `uv run` with env var prefix (SecurIQ project)

**Context:** Agent ran full pytest suite on a Python project. Used `shell("cd /path && PYTHONPATH=src uv run pytest --tb=short -q 2>&1 | tail -5")` instead of run_and_watch.

### Agent's reasoning

run_and_watch rejected the command because `PYTHONPATH=src uv run pytest ...` starts with an env var prefix, not an allowed command prefix. After the rejection, agent fell back to shell for all subsequent test runs.

**Error message received:** "Command not allowed. Must start with one of: npx, npm, node, tsc, eslint, vitest, jest, pnpm, bun, make, cmake, bash."

### Agent's self-correction

Agent identified the workaround: `bash -c 'PYTHONPATH=src uv run pytest ...'` — since `bash` is in the allowlist. Committed to using this pattern going forward.

### Two issues

1. **`uv` is in the allowlist (added v0.9.14)** but `uv run` preceded by env vars (`PYTHONPATH=src uv run ...`) fails because the allowlist checks the first token, which is `PYTHONPATH=src` not `uv`.

2. **Same root cause as the original allowlist rejection pattern (v0.9.7-0.9.13):** One rejection → full session shell fallback. Agent gives up on the tool entirely after a single failure.

### Fix options

1. **Strip leading env var assignments before checking allowlist** — detect `KEY=val` prefix pattern and skip to the actual command. This is the correct fix since `child_process.spawn` doesn't support inline env vars anyway (they should go in the `env` parameter).
2. **Better error message** — when env var prefix detected, suggest: "Move PYTHONPATH=src to the env parameter: `run_and_watch('uv run pytest ...', env: {PYTHONPATH: 'src'})`"
3. **Document the `bash -c` workaround** in SKILL.md as immediate mitigation.

### Pattern

This is the 5th+ instance of "allowlist rejection → full session shell fallback." The allowlist is the #1 cause of agents abandoning run_and_watch. Each fix (adding commands, fixing formats) catches one variant but new ones keep appearing. The env-var-prefix variant is particularly common in Python projects.

**Status:** ✅ Fixed v0.9.21 — Allowlist now strips leading `KEY=val` env var assignments before checking the command prefix. Also emits a stderr hint suggesting the `env` parameter instead.

---

## 2026-05-18 - Agent wrote 160-line MCP handshake test instead of using verify_mcp (PilotIQ project)

**Context:** Agent needed to verify an MCP server starts and responds to the initialize handshake. Wrote a manual 160-line subprocess test with `select` + Content-Length parsing. Got stuck for ~30 minutes on stdin/stdout deadlocks. Eventually used `verify_mcp` which solved it in 2.2 seconds.

### What happened

1. Agent needed to test `uv run python -m pilotiq.mcp.server` responds to MCP handshake
2. Wrote manual subprocess code: spawn process, write JSON-RPC initialize, parse Content-Length header, read response
3. Got stuck on stdio deadlock — MCP's stdio transport blocks when both sides wait for input
4. Spent ~30 minutes debugging the subprocess test
5. When prompted "why not TP?", immediately recognized `verify_mcp` is purpose-built for this
6. `verify_mcp(command="uv run python -m pilotiq.mcp.server")` — passed in 2.2s

### Agent's self-assessment

> "The 160-line test file I wrote is redundant now — TracePulse handles it better. I violated the steering rule: 'Use dedicated tools instead of terminal commands when a relevant tool is available.'"

### Root cause

Agent didn't have `verify_mcp` in its mental model of available tools. It's a newer tool (shipped v0.9.8) and the agent's training data has many examples of manual subprocess MCP testing but few examples of `verify_mcp`.

### Pattern

Same as the shell-for-grep and shell-for-pytest patterns: agent defaults to manual implementation when a purpose-built tool exists. The difference here is severity — 30 minutes lost vs 30 seconds with the right tool.

### Enforcement options

1. **SKILL.md guidance** — add explicit rule: "To verify an MCP server starts correctly, ALWAYS use verify_mcp. Never write manual subprocess/handshake code."
2. **Tool description enhancement** — make verify_mcp's description more discoverable: mention "MCP handshake", "initialize", "stdio transport deadlock" as keywords
3. **Kiro hook** — detect when agent writes subprocess code that sends JSON-RPC initialize, suggest verify_mcp instead

**Status:** ✅ Agent self-corrected. Enforcement improvements needed to prevent recurrence.

---

## 2026-05-19 - Agent chains git+build+deploy in one shell command (Nexus project)

**Context:** Agent committed files, ran `npm run build`, and deployed — all in one chained shell command. When asked "why not TP?", correctly identified the split:

### Agent's self-correction

> 1. shell for git operations (no structured output needed)
> 2. run_and_watch for npm run build (structured pass/fail, error parsing)
> 3. shell for bash scripts/deploy.sh (custom script, no parser)

> "I was being lazy by chaining everything into one mega-command."

### Agent discovered get_session_insights flags this

Agent called `get_session_insights` and found:
- "No TracePulse tools called this session."
- "No get_project_health() call in this session."

> "TP already has the mechanism to flag my bad behavior — I just never called it."

### Gap identified: passive shell-command detection

Agent's feature request:

> "If TP had a way to passively detect when I use shell for commands that have a dedicated parser (like npm run build, pytest, tsc) and flag it in get_session_insights without me needing to ask. Like a 'missed opportunities' section that says 'You ran npm run build via shell 3 times — use run_and_watch or verify_build instead.'"

### Analysis

This is the same pattern as every previous shell fallback, but with a new insight: **the agent never calls the self-check tools**. `get_session_insights` and `get_audit_trail` already exist to catch this, but agents don't call them proactively.

**Three enforcement layers, in order of effectiveness:**

1. **Passive detection (new feature)** — TracePulse can't see shell calls from other MCP tools directly. BUT: the audit trail records which TP tools were called. If a session has 0 run_and_watch calls but the agent has been active for 30+ minutes, `get_session_insights` could flag "No test/build commands run through TracePulse this session — are you using shell instead?"

2. **Kiro hook (existing mechanism)** — A PostToolUse hook that fires after shell calls, checks if the command matches run_and_watch patterns (pytest, vitest, tsc, npm run build, cargo test), and injects a reminder. This is the only way to intercept shell calls in real-time.

3. **SKILL.md "session opener" rule** — Require agents to call `get_project_health()` at session start. This primes the TP habit loop. Already in SKILL.md but agents skip it.

**The real gap:** TracePulse cannot observe shell calls made through other MCP tools. It only sees its own tool invocations. The "missed opportunities" feature would need either:
- A Kiro/Claude hook that intercepts shell calls and reports them to TP
- Or inference from absence: "You've been active 45 min with 0 run_and_watch calls — likely using shell for builds"

**Status:** 🔲 Planned — "missed opportunities" inference in get_session_insights (detect absence of expected tool usage). Kiro hook for real-time shell interception is a separate M13 item.

---

## 2026-05-19 - run_and_watch rejects `uv run pytest` despite uv being in allowlist (PilotIQ project)

**Context:** Agent needed to run `uv run pytest` on a Python project. run_and_watch rejected it. Agent fell back to shell, then self-corrected by creating a `scripts/test.sh` wrapper and using `bash scripts/test.sh`.

### Root cause

The agent used `cd /path && uv run pytest` which was rejected for shell metacharacters (`&&`). When it tried `uv run pytest` with `cwd`, it worked — but the agent had already given up after the first rejection.

**However**, the agent also reported that `uv run pytest` was rejected by the allowlist earlier in the session. This shouldn't happen — `uv` and `uv run` are in the Python stack allowlist (added v0.9.14). Possible causes:
1. The project doesn't have a Python stack detected (no `requirements.txt`, `pyproject.toml`, or `.venv`)
2. The agent is using an older TracePulse version without the Python stack detection
3. The `cd /path &&` prefix caused the metachar rejection, not the allowlist

### The workaround pattern

Agent created `scripts/test.sh`:
```bash
#!/bin/bash
exec uv run pytest --tb=short -v "$@"
```
Then used `run_and_watch("bash scripts/test.sh", cwd: "/path/to/project")`.

This works but is unnecessary friction. The correct invocation should be:
```
run_and_watch("uv run pytest --tb=short -v", cwd: "/home/sourjya/coding/pilotiq")
```

### Pattern (6th+ instance)

Same as every previous allowlist rejection: one failure → agent creates workaround → never tries the direct approach again. The `bash scripts/test.sh` pattern is a valid workaround but adds a file to every project.

### Action needed

1. Verify `uv run` is detected correctly when project has `pyproject.toml` with `[tool.uv]` or `uv.lock`
2. The env var prefix fix (v0.9.21) may not cover this case — need to check if `cd /path &&` was the actual rejection reason (metachar, not allowlist)
3. SKILL.md should explicitly show: `run_and_watch("uv run pytest", cwd: "/absolute/path")` as the canonical Python pattern

**Status:** 🔲 Investigate — likely a metachar rejection misreported as allowlist rejection by the agent.

---

## 2026-05-19 - Agent proposes "scripts/test.sh at project init" pattern (PilotIQ)

**Context:** Follow-up to the previous entry. Agent clarified it DID use run_and_watch for subsequent test runs (via `bash scripts/test.sh`). The shell call was from before the wrapper existed.

### Agent's lesson

> "I should have created scripts/test.sh at the very start of the project (during M0 skeleton) so that TP was always the default path."

> "Rule for future sessions: First thing in any new project → create scripts/test.sh so run_and_watch works from minute one."

### Assessment

The agent is solving the wrong problem. `scripts/test.sh` is unnecessary friction — the correct invocation is:
```
run_and_watch("uv run pytest --tb=short", cwd: "/path/to/project")
```

`uv` and `uv run` are in the Python stack allowlist. The agent's original rejection was from `cd /path && uv run pytest` (metachar `&&`), not from `uv run pytest` itself. The error message already says "Use cwd parameter instead."

### The real fix

The agent needs to internalize: **`cwd` replaces `cd`**. No wrapper script needed. Add to SKILL.md Python section:
```
# WRONG (metachar rejection):
run_and_watch("cd /path && uv run pytest")

# RIGHT:
run_and_watch("uv run pytest --tb=short", cwd: "/path/to/project")
```

**Status:** ✅ Already documented in SKILL.md and error message. Agent will internalize on next session.

---

## 2026-05-19 - Agent chains git+merge+deploy+push in one mega shell command (Nexus M43)

**Context:** Agent ran `git add && git commit && git checkout && git merge && bash scripts/deploy.sh && git push` as a single shell call. Build was correctly done via run_and_watch.

### Agent's self-assessment

> "The git+deploy chain is legitimately a shell use case — there's no TP parser for git commit or custom deploy scripts."

This is correct. Git operations and deploy scripts are legitimate shell uses. The issue is readability and atomicity — one mega-command makes it impossible to see which step failed.

### What's legitimate shell vs what should be TP

| Command | Tool | Reason |
|---------|------|--------|
| `npm run build` | run_and_watch ✅ | Parseable output |
| `git add + commit` | shell ✅ | No parser needed |
| `git checkout + merge` | shell ✅ | No parser needed |
| `bash scripts/deploy.sh` | shell ✅ | Custom script |
| `git push` | shell ✅ | No parser needed |

The agent is correct that these are all legitimate shell uses. The feedback is about **splitting them into readable atomic calls**, not about using TP instead.

### No TP action needed

This is a code hygiene issue, not a TracePulse gap. The steering files already say "Use dedicated tools instead of terminal commands when a relevant tool is available" — git and deploy scripts don't have dedicated tools.

**Status:** ✅ Correct behavior. Agent self-corrected to split into smaller calls.
