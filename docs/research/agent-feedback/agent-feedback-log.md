# Agent Feedback Log

Real-world feedback from AI coding agents using TracePulse. Used to prioritize improvements.

---

## 2026-04-28 - Kiro CLI agent on Acme App project

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

## 2026-04-28 (session 2) - Kiro CLI agent on Acme App project

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

The agent produced a comprehensive session report after ~35 tool invocations across a full day of Acme App development.

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

Agent ran `psql -U postgres -d planiq -c "SELECT..."` via shell. psql prompted for password interactively, blocking the session. User had to intervene.

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