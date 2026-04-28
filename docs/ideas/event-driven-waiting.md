# Event-Driven Waiting - Design Spec

## The Problem

Every TracePulse tool is either an instant poll or a timed watch. Neither can answer:
- "Wait until Vite finishes recompiling, then tell me the result"
- "Run pytest, wait for it to finish, give me structured results"
- "Block until the next error appears"

The agent's workaround is polling with delays and hoping the timing works. This is unreliable.

## Proposed Tools

### 1. `wait_for_build` - Event-driven build completion

```
Agent calls: wait_for_build(timeout_seconds: 30)

TracePulse:
  1. Record current last_build_at timestamp
  2. Subscribe to buffer events
  3. Wait for a hot-reload/build-success event with timestamp > recorded
  4. Return immediately with build result
  5. If timeout: return { timed_out: true, last_build_at: <unchanged> }

Response:
{
  "status": "success",           // or "failed" or "timed_out"
  "build_tool": "vite",          // detected from hot-reload pattern
  "duration_ms": 245,            // time from call to build event
  "build_errors": [],            // any build-error events since the build
  "last_build_at": 1714300005000
}
```

**Implementation:** Subscribe to buffer, filter for `hotreload:*` fingerprints. When one arrives, check for build-error events that arrived in the same window. Return composite result.

**Effort:** Low - reuses existing subscription mechanism from watch_for_errors.

### 2. `run_and_watch` - Execute command and parse output

```
Agent calls: run_and_watch(command: "npx vitest run tests/unit/", timeout_seconds: 60)

TracePulse:
  1. Spawn the command as a child process
  2. Pipe stdout/stderr through the full parser pipeline
  3. Wait for process to exit
  4. Return all events collected during the run

Response:
{
  "exit_code": 1,
  "duration_ms": 3450,
  "events": [...],               // all RuntimeEvents from the run
  "errors": [...],               // just error-level events
  "summary": "2 failed, 15 passed"  // if test runner summary was parsed
}
```

**Implementation:** Similar to ProcessSpawner but ephemeral - spawn, collect, return, cleanup. Uses existing pipeline and parsers.

**Effort:** Medium - new ephemeral process spawner, but reuses all existing pipeline code.

### 3. `wait_for_event` - Generic event-driven blocking

```
Agent calls: wait_for_event(type: "error", timeout_seconds: 30)

TracePulse:
  1. Subscribe to buffer
  2. Wait for next event matching type filter
  3. Return the event immediately

Types:
  "error"    - any error-level event
  "build"    - any hot-reload/build event
  "crash"    - crash loop or process exit
  "any"      - literally any event (confirms the server is producing output)

Response:
{
  "event": { ... },              // the RuntimeEvent that triggered
  "wait_duration_ms": 1234
}
```

**Implementation:** Thin wrapper around buffer.subscribe with a type filter.

**Effort:** Low.

## Architecture

All three tools use the same primitive: **subscribe to the buffer and resolve a Promise when a matching event arrives.** This is the same mechanism `watch_for_errors` uses, but instead of waiting for a timer, it waits for a specific event.

```
watch_for_errors:  subscribe -> collect for N seconds -> return all
wait_for_build:    subscribe -> return on first hotreload event
wait_for_event:    subscribe -> return on first matching event
run_and_watch:     spawn process -> pipe through pipeline -> return on exit
```

## Priority

| Tool | Effort | Impact | Build? |
|------|--------|--------|--------|
| `wait_for_build` | Low | HIGH - solves the #1 agent trust gap | Yes |
| `wait_for_event` | Low | Medium - generic primitive | Yes |
| `run_and_watch` | Medium | HIGH - replaces shell + manual parsing | Next cycle |
