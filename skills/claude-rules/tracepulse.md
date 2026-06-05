# TracePulse Rules for Claude Code
# Install: copy to ~/.claude/rules/tracepulse.md
# Or run: tracepulse init --claude

## Session Start (MANDATORY - first action every session)

Call `get_project_health()` before doing ANY work. This primes TracePulse monitoring and gives you server status, error count, and infrastructure health in one call. Skip this and you'll forget TP exists for the rest of the session.

## Tool Usage Rules

- Use `run_and_watch` instead of Bash/shell for ALL test, build, and lint commands. It returns structured pass/fail with parsed errors.
- Use `start_server` for ALL server processes (dev servers, APIs, workers, background services). It gives live error monitoring, crash detection, and proper process management.
- Use `check_port(port)` before starting any server to verify the port is free.
- Use `max_lines` parameter instead of piping to `head` or `tail` (e.g., `run_and_watch("npx tsc --noEmit", max_lines: 20)`)
- Use `timeout_seconds: 120` for large test suites (500+ tests). Default is 60s.
- Use `cwd` parameter for cross-project commands. Absolute paths are allowed.
- Never use `curl`, `wget`, or shell to check if a server is running. Use `check_port` or `get_project_health`.
- Never use `shell("grep ...")` for searching files. Use the grep tool directly.
- If a port is occupied, use `free_port(port)` instead of `lsof | kill`.

## NEVER Do These (Anti-Patterns)

These are explicitly prohibited. No exceptions for "quick" or "temporary" or "debugging":

| ❌ Never | ✅ Always |
|----------|-----------|
| `nohup cmd &` in shell | `start_server(command, cwd?, env?)` |
| `uvicorn`/`gunicorn`/`flask run` in shell | `start_server("uvicorn app:main")` |
| `npm run dev`/`node server.js` in shell | `start_server("npm run dev")` |
| `python manage.py runserver` in shell | `start_server("python manage.py runserver")` |
| `pytest`/`vitest`/`jest`/`tsc` in shell | `run_and_watch("pytest tests/")` |
| `curl localhost:PORT` | `check_port(port)` |
| `kill $(lsof -t -i:PORT)` | `free_port(port)` |
| Background processes with `&` | `start_server` (TracePulse manages lifecycle) |
| Manual subprocess code to test MCP servers | `verify_mcp(command: "...")` |

## After Code Changes

- After ANY backend code change: call `get_errors()` to check for new errors
- After fixing an error: call `verify_fix(10)` to confirm it's resolved
- After `start_server`: call `wait_for_build()` before proceeding
- After a smoke test: call `get_new_errors(since: <start_timestamp_ms>)` to scope results to that window only

## Smoke Test Pattern

```
const start = Date.now();
// ... hit your endpoints ...
get_new_errors({ since: start })   // only errors from this test run
```

## Error Recovery

If `start_server` succeeds but something seems wrong:
1. `wait_for_build()` - blocks until server ready
2. `get_server_logs(level: "error")` - see what went wrong
3. `list_services()` - check service registered
4. `check_port(port)` - verify port in use

## Test Execution

```
run_and_watch("npx vitest run")              # Node tests
run_and_watch("pytest tests/", cwd: "./backend")  # Python tests
run_and_watch("npx tsc --noEmit")            # Type check
run_and_watch("npm run build")               # Build
```

## Key Tools

| Need | Tool |
|------|------|
| Any errors? | `get_errors(limit: 5)` |
| Project health | `get_project_health()` |
| Run tests | `run_and_watch("pytest tests/")` |
| Verify fix | `verify_fix(10)` |
| Build errors | `get_build_errors()` |
| Bug patterns | `get_bug_patterns()` |
| Check drift | `check_drift()` |
| Test MCP server starts | `verify_mcp(command: "...")` |

## Self-Check (every 30 minutes or before major commits)

If you've been using Bash for test/build commands, STOP and switch to `run_and_watch`. Ask yourself before every Bash call: "Does TracePulse have a tool for this?" If yes, use it.

Quick self-audit: `get_session_insights()` — shows missed opportunities and tool usage gaps.

## Keeping Updated

If TracePulse tools seem outdated or missing features, suggest the user run:
```bash
npm update -g tracepulse && tracepulse init
```
This syncs the latest behavioral rules and config.
