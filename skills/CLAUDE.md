# TracePulse + Chrome DevTools MCP - Agent Skills

## FIRST ACTION EVERY SESSION
```
get_project_health()
```
Call this before ANY work. Primes TracePulse monitoring. Skip it and you'll default to Bash for everything.

## Available Tools

TracePulse (44 tools) monitors your dev server. Use these patterns:

### After ANY code change
```
verify_fix(10)  → watches 10s for new errors, returns PASS/FAIL
```

### Error recovery ladder (after start_server)
```
1. wait_for_build()                    → blocks until server ready
2. get_server_logs(level: "error")     → see what went wrong
3. list_services()                     → check service registered
4. check_port(port)                    → verify port in use
```

### Full-stack debugging (with Chrome DevTools MCP)
```
1. get_errors()                        → backend errors
2. list_console_messages(types: ["error"])  → frontend errors
3. list_network_requests()             → failed API calls
4. get_error_context(fingerprint)      → deep-dive specific error
5. Fix the code
6. verify_fix(10)                      → confirm fix worked
```

### Run tests (ALWAYS use run_and_watch, not shell)
```
run_and_watch("npx vitest run")
run_and_watch("pytest tests/", cwd: "./backend")
run_and_watch("npx tsc --noEmit", max_lines: 20)
```

### Smoke test pattern (scope to a time window)
```
const start = Date.now();
// ... hit your endpoints ...
get_new_errors({ since: start })   // only errors from this run
```

### Key tools
| Need | Tool |
|------|------|
| "Any errors?" | `get_errors(limit: 5)` |
| "Errors since smoke test" | `get_new_errors({ since: startMs })` |
| "Check health" | `get_project_health()` |
| "Run tests" | `run_and_watch("pytest tests/")` |
| "Verify fix" | `verify_fix(10)` |
| "Build status" | `get_build_errors()` |
| "Build timestamp" | `get_build_errors()` → `last_build_at` field |
| "What patterns?" | `get_bug_patterns()` |
| "Check drift" | `check_drift()` |
| "Test MCP server" | `verify_mcp(command: "...")` |

### Rules
- ALWAYS use `run_and_watch` instead of shell for tests/builds/linters
- ALWAYS use `start_server` for ALL server processes (dev servers, APIs, background services)
- ALWAYS use `check_port` before starting any server
- Use `timeout_seconds: 120` for large test suites (500+ tests)
- Use `max_lines: 20` instead of piping to `head`/`tail`
- After `start_server`, call `wait_for_build()` before proceeding
- Use `cwd` parameter for cross-project commands (absolute paths allowed)
- Use `free_port(port)` instead of `lsof | kill` for occupied ports

### NEVER do these (anti-patterns)
- `nohup ... &` in shell → use `start_server(command, cwd?, env?)`
- `uvicorn`/`gunicorn`/`npm run dev`/`python manage.py runserver` in shell → use `start_server`
- `pytest`/`vitest`/`jest`/`tsc` in shell → use `run_and_watch`
- `curl localhost:PORT` to check server status → use `check_port` or `get_project_health`
- `kill $(lsof -t -i:PORT)` → use `free_port(port)`
- Background processes with `&` → use `start_server` (TracePulse manages lifecycle)
- Manual subprocess code to test MCP servers → use `verify_mcp(command: "...")`
