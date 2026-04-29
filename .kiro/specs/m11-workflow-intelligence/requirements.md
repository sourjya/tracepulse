# M11: Agent Workflow Intelligence - Spec

## Overview

6 features from real agent feedback that improve the agent's workflow with TracePulse. Focused on reducing friction and making TP smarter about context.

---

## Feature 1: register_probe MCP tool (agent-generated health probes)

**Priority: HIGH - biggest new idea from agent feedback**

The agent knows every endpoint it built. It should register health probes automatically.

### MCP Tool

```
register_probe({
  name: "login",
  method: "POST",
  url: "http://localhost:8000/api/v1/auth/login",
  body: { "email": "test@test.com", "password": "test123" },
  expect_status: 200,
  expect_body_contains: "access_token",
  interval_seconds: 60
})
```

### How it works

1. Agent calls `register_probe` after building a route
2. TP stores the probe definition in memory
3. Background loop executes probes on schedule (reuses health prober infrastructure)
4. Failures surface in `get_project_health` and `get_errors`
5. Kiro hook can auto-trigger: file change in `api/` -> agent reviews route -> registers probe

### Implementation

- New tool: `src/tools/register-probe.ts`
- Extend `src/infra/health-prober.ts` to accept dynamic probe list
- Store probes in memory (lost on restart) or `.tracepulse/probes.json`
- **Effort: Medium (1-2 hours)**

---

## Feature 2: Old vs new error distinction in get_health_summary

**Priority: HIGH - agent asked for this directly**

"10 errors" should say "10 errors (0 new since last check)" so the agent knows if they're stale.

### Implementation

- Track a `last_checked_at` timestamp, updated each time `get_errors` or `get_health_summary` is called
- Count errors with `timestamp > last_checked_at` as "new"
- Response: `"10 errors (3 new since last check, 7 pre-existing)"`
- **Effort: Low (20 min)**

---

## Feature 3: Auto-clear buffer on restart_server

**Priority: MEDIUM - reduces friction**

After `restart_server`, old errors are stale. Auto-clear saves a manual `clear_errors` call.

### Implementation

- In `restart_server` handler, call `buffer.clear()` after successful restart
- Response includes `cleared_count`
- **Effort: Low (5 min)**

---

## Feature 4: watch_for_errors pre-existing error note

**Priority: MEDIUM - saves a tool call**

When watch returns 0 new events, include "N pre-existing errors in buffer" so the agent doesn't need a separate `get_errors` call.

### Implementation

- After watch completes, query buffer for error-level events
- Add to response: `pre_existing_errors: N`
- **Effort: Low (10 min)**

---

## Feature 5: Migration error suggestion

**Priority: LOW - nice to have**

When "column X does not exist" is detected, add a suggestion field: "Run pending migrations (e.g., alembic upgrade head)".

### Implementation

- In infra-patterns, add a `suggestion` field to migration category patterns
- Surface in `get_errors` response on matching events
- **Effort: Low (15 min)**

---

## Feature 6: Debugging loop in GitBook docs

**Priority: LOW - documentation only**

The `get_new_errors -> fix -> clear_errors -> verify_fix` loop is the most productive workflow but only documented in SKILL.md, not in the GitBook tutorials.

### Implementation

- Add to `gitbook/tutorials/edit-verify-loop.md`
- **Effort: Low (10 min)**
