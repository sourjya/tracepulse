# TracePulse Demo Designs

## What We're Proving

Every demo must answer one question the audience is already asking:

> "My agent writes code fine. Why do I need another MCP server?"

The answer: your agent writes code blind. It can't see what happens when that code runs. TracePulse gives it eyes on the backend - and the difference is dramatic.

---

## Demo 1: "The Five-Bug Gauntlet" (3 minutes)

**Audience question:** "How fast can an agent fix real bugs with TracePulse?"

**Setup:** A working FastAPI + React + PostgreSQL task manager app. Before the demo, inject 5 bugs that represent the most common dev-time failures:

| Bug | What breaks | What the agent sees via TP |
|-----|-------------|---------------------------|
| 1. Pending migration | `column "priority" does not exist` on every API call | `get_errors()`: 25 occurrences, signal_score 95, fix_suggestion: "Run pending migrations" |
| 2. Missing pip package | `ModuleNotFoundError: No module named 'pydantic_settings'` | `get_errors()`: error narrative with `pip install pydantic-settings` |
| 3. Redis not running | Connection refused on session store | `get_project_health()`: "1 unreachable service: Redis" |
| 4. Broken API query | `AttributeError: 'Task' object has no attribute 'assignee_name'` | `get_error_context(fp)`: file:line + surrounding logs + occurrence count |
| 5. Silent 500 | Frontend shows blank page, no console error | `get_errors(status_code_min: 500)`: catches the backend 500 the browser never shows |

**The demo flow:**

```
Agent: get_project_health()
  -> "3 errors, 1 unreachable service (Redis), 1 pending migration"

Agent: get_errors(limit: 5)
  -> All 5 bugs ranked by signal_score. Agent fixes #1 (highest score) first.

Agent: [fixes migration] -> verify_fix(5) -> PASS
Agent: [fixes missing package] -> verify_fix(5) -> PASS
Agent: [starts Redis] -> get_project_health() -> all services reachable
Agent: [fixes ORM query] -> verify_fix(5) -> PASS
Agent: [fixes silent 500] -> verify_fix(5) -> PASS

Total: 5 bugs, 5 verify_fix calls, 0 human interventions, ~2 minutes
```

**Key features demonstrated:**
- `get_project_health` as single entry point
- Signal scoring (agent fixes highest-impact first)
- Error narratives (install commands, migration commands)
- `verify_fix` as completion gate
- Infrastructure awareness (Redis down)
- Silent 500 detection (the bug browsers can't see)

**Why it convinces:** The audience watches 5 real bugs get fixed in 2 minutes with zero human help. The "silent 500" bug is the clincher - that's the one nobody catches until production.

---

## Demo 2: "The Blind Agent" (5 minutes, side-by-side)

**Audience question:** "What's the actual difference vs not having TracePulse?"

**Setup:** Same app, same 3 bugs (migration, missing package, silent 500). Two recordings side by side.

**Left panel - Without TracePulse:**

```
Human: "The app isn't working. Can you check?"
Agent: [runs tsc --noEmit] "No TypeScript errors."
Agent: [runs npm run build] "Build succeeded."
Human: "But the page is blank."
Agent: "Let me check the API..." [reads source code, guesses]
Agent: [makes wrong fix, doesn't know it failed]
Human: "Still broken. Here's what the terminal says: [pastes 40 lines of logs]"
Agent: [finally sees the migration error, fixes it]
Human: "One down, but there's still a blank page..."
[repeat for each bug]
```

**Right panel - With TracePulse:**

```
Agent: get_project_health()
  -> 3 errors found. Fixing highest-signal first.
Agent: [fixes all 3] -> verify_fix() -> PASS
Agent: "All clear. 3 bugs fixed, verified clean."
```

**Metrics table shown at the end:**

| Metric | Without TP | With TP |
|--------|-----------|---------|
| Human messages needed | 8 | 0 |
| Time to fix all 3 | 12 min | 2 min |
| Wrong fixes attempted | 2 | 0 |
| Tokens consumed | ~45,000 | ~5,000 |
| Agent knew about silent 500 | No (human found it) | Yes (first scan) |

**Key features demonstrated:**
- Zero human intervention vs constant hand-holding
- Token efficiency (90% reduction)
- No wrong fixes (agent has data, not guesses)
- Runtime errors vs static analysis gap

**Why it convinces:** The side-by-side makes the difference visceral. The left panel is frustrating to watch. The right panel is satisfying. The metrics table makes it quantifiable.

---

## Demo 3: "Build From Scratch" (10 minutes, long-form)

**Audience question:** "Does it actually help during real development, not just bug fixing?"

**Setup:** No pre-built project. Give the agent a spec and record the full build session.

**The spec:**
> "Build an Express + SQLite task API with: POST /tasks, GET /tasks, PATCH /tasks/:id, DELETE /tasks/:id. Add a simple HTML frontend with a task list and add form. Use better-sqlite3."

**What naturally goes wrong during a build (and TP catches):**

1. `npm install better-sqlite3` fails (native module, needs build tools) -> TP catches the npm error
2. First server start: port 3000 already in use -> TP catches EADDRINUSE, suggests alternate port
3. SQLite table doesn't exist yet (forgot CREATE TABLE) -> TP catches "no such table: tasks"
4. Frontend fetch to wrong port -> TP catches the 404/CORS error on the backend side
5. PATCH handler typo (`req.body.titel` instead of `title`) -> TP catches the silent data loss via 200 response but agent sees the field is always null in subsequent GET

**The narrative:**

The agent builds the app from zero. Every time something goes wrong, TracePulse catches it in the background. The agent calls `get_build_errors()` after every file save (23 times in the session). It calls `verify_fix()` after every bug fix. It never asks the human for help.

**Counter shown on screen throughout:**
- TracePulse calls: 40+
- Human interventions: 0
- Errors caught at runtime: 5
- Errors caught by tsc: 2
- Time: 10 minutes

**Key features demonstrated:**
- Edit-verify loop (get_build_errors as habitual check)
- Hot-reload detection
- Multiple parser coverage (Node.js errors, SQLite errors, HTTP access logs)
- The tool disappears into the workflow - it's not a separate step, it's ambient awareness

**Why it convinces:** This is the most authentic demo. No staged bugs, no tricks. Real development with real errors. The audience sees that TracePulse isn't a debugging tool you reach for - it's infrastructure the agent relies on continuously.

---

## Demo 4: "The Three-Layer Stack" (5 minutes)

**Audience question:** "How does TracePulse fit with browser tools I already use?"

**Setup:** A FastAPI + React app with a bug that spans the full stack: the dashboard shows "0 tasks" even though tasks exist in the database.

**The debugging flow:**

```
Step 1 - TracePulse (backend):
Agent: get_errors()
  -> No backend errors. Server is healthy.
Agent: get_requests(path: "/api/tasks")
  -> GET /api/tasks 200, response_time: 45ms
  -> The API is returning 200. Backend is fine.

Step 2 - Chrome DevTools MCP (browser):
Agent: list_network_requests()
  -> GET /api/tasks 200, but response body is { "tasks": [] }
Agent: list_console_messages(types: ["error"])
  -> "Warning: Each child in a list should have a unique key prop"
  -> No fetch errors. The API returned empty array.

Step 3 - Back to TracePulse:
Agent: get_server_logs(message_contains: "SELECT", limit: 5)
  -> SELECT * FROM tasks WHERE tenant_id = 'null'
  -> Found it! The query is filtering by tenant_id = null.

Agent: [fixes the tenant_id filter in the query]
Agent: verify_fix(5) -> PASS
Agent: [refreshes browser, takes screenshot] -> Dashboard shows 12 tasks
```

**Key features demonstrated:**
- TracePulse + Chrome DevTools MCP working together
- Backend looked healthy (200 OK) but the query was wrong
- `get_server_logs(message_contains)` as a surgical search tool
- The bug was invisible to the browser (200 response, valid JSON, just wrong data)
- Neither tool alone could find it - the combination did

**Why it convinces:** This is the demo for teams already using Chrome DevTools MCP or similar browser tools. It shows TracePulse isn't a replacement - it's the missing layer. The bug is realistic (wrong query filter) and impossible to find from the browser side alone.

---

## Implementation Plan

| Demo | Project | Language | Build time | Priority |
|------|---------|----------|------------|----------|
| 1. Five-Bug Gauntlet | FastAPI + React + PostgreSQL | Python | 2 hours | First |
| 2. Blind Agent | Same as Demo 1 | Python | 1 hour (recording only) | Second |
| 3. Build From Scratch | Express + SQLite + vanilla HTML | Node.js | 30 min (live recording) | Third |
| 4. Three-Layer Stack | FastAPI + React | Python | 1 hour | Fourth |

Demo 1 and 2 share the same project. Demo 3 is recorded live. Demo 4 needs a separate project with a specific cross-stack bug.

## Recording Format

- Screen recording with terminal + browser visible
- TracePulse tool calls highlighted/annotated as they happen
- Metrics counter overlay (calls made, time elapsed, human interventions)
- Final summary card with before/after comparison
