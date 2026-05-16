# TracePulse + Chrome DevTools MCP - Agent Skills

## Available Tools

TracePulse (39 tools) monitors your dev server. Use these patterns:

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

### Key tools
| Need | Tool |
|------|------|
| "Any errors?" | `get_errors(limit: 5)` |
| "Check health" | `get_project_health()` |
| "Run tests" | `run_and_watch("pytest tests/")` |
| "Verify fix" | `verify_fix(10)` |
| "Build status" | `get_build_errors()` |
| "What patterns?" | `get_bug_patterns()` |
| "Check drift" | `check_drift()` |

### Rules
- ALWAYS use `run_and_watch` instead of shell for tests/builds/linters
- Use `timeout_seconds: 120` for large test suites (500+ tests)
- Use `max_lines: 20` instead of piping to `head`/`tail`
- NEVER use `curl` to check server status - use `check_port` or `get_project_health`
- Use `free_port(port)` instead of `lsof | kill` for occupied ports
- After `start_server`, call `wait_for_build()` before proceeding
- Use `cwd` parameter for cross-project commands (absolute paths allowed)
