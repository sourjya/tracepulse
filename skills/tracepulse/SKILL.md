---
name: tracepulse
description: Uses TracePulse MCP server for backend runtime error monitoring. Use after ANY backend code change to check for errors, verify fixes, and triage crashes. TracePulse watches dev server logs (stdout/stderr or log files) and exposes parsed, scored errors as MCP tools. Works with any language - Node.js, Python, Go, Java, Rust, TypeScript.
---

## Core Concepts

**What TracePulse does**: Watches your dev server's output (stdout/stderr or a log file), parses errors from 9 sources (Node.js, Python, Go, Java, Rust, JSON structured logs, TypeScript compiler, ESLint, Vite/webpack), scores them by severity (0-100), and exposes them as MCP tools. You never need to read raw terminal output or log files.

**Two modes**:
- **Start mode**: TracePulse spawns your dev server and captures its output
- **Attach mode**: TracePulse tails an existing log file - use this when servers are already running, managed by scripts, Docker, or process managers

**Signal scoring**: Every error gets a `signal_score` (0-100) and `signal_strength` (high/medium/low). High-signal errors (≥50) have clear stack traces pointing to your code. Low-signal events (<20) are warnings or noise. Always triage high-signal errors first.

**Fingerprints**: Each unique error gets a stable fingerprint (hash). Same error = same fingerprint. This enables deduplication, occurrence counting, and cross-session tracking.

## Workflow Patterns

### After ANY backend code change (most common)

This is the core loop. Do this every time you edit a backend file:

1. Edit the backend file (Python, Node.js, etc.)
2. `get_errors(limit: 5)` - check for import errors, syntax errors, startup crashes
3. If the app serves HTTP, navigate to the affected page in the browser
4. `get_errors(limit: 5)` - check for runtime errors (500s, exceptions from the request)
5. If errors: read `context.file` at `context.line`, fix, repeat from step 1
6. If clean: move on

### Three-tier verification (recommended)

Use the right level of verification for the situation:

| Tier | Tool | Speed | When to use |
|------|------|-------|-------------|
| 1. Static | `tsc --noEmit` or linter via shell | Instant | After every edit |
| 1.5 Browser | Chrome DevTools: `list_console_messages(types: ["error"])` | 2s | After frontend edits - tsc misses runtime scope errors in lazy-loaded components |
| 2. Runtime | `verify_fix(3)` or `get_build_errors()` | 3s | After edits that affect running server |
| 3. Comprehensive | Full test suite + build via `run_and_watch` | 20s+ | At task completion only |

**Tier 1.5 is critical for frontend changes.** `tsc --noEmit` cannot trace runtime scope through lazy-loaded component boundaries. A variable that exists in the file but isn't in scope at runtime will pass tsc but crash the page. Navigate to the affected page and check console errors before calling verify_fix.

**Prefer `run_and_watch` over shell for tests and builds.** It parses output through TracePulse's test runner parsers and returns structured pass/fail counts:
```
run_and_watch("pytest tests/unit/")     -> { passed: 554, failed: 0, warnings: 11 }
run_and_watch("npx vitest run")         -> { passed: 120, failed: 0 }
run_and_watch("npx vite build")         -> { build: "success", modules: 342 }
```
For monorepos with separate frontend/backend dirs, use the `cwd` parameter:
```
run_and_watch("npx vitest run", cwd: "./frontend")
run_and_watch("pytest tests/", cwd: "./backend")
```
Commands must start with an allowed prefix (npx, npm, node, pytest, python, tsc, eslint, vitest, jest, go test, cargo test). Don't prefix with `cd`.

### The proven debugging loop (most productive workflow)

When TracePulse surfaces real errors, this is the fastest resolution path:

1. `get_new_errors(limit: 5)` - see only errors with unseen fingerprints
2. Read the error: `context.file`, `context.line`, `context.error_type`
3. Fix the root cause
4. `clear_errors()` - reset the buffer for a clean baseline
5. `verify_fix(10)` - watch 10s, confirm zero new errors, pass/fail verdict
6. If PASS: move on. If FAIL: repeat from step 2.

This loop resolved a 25-occurrence migration error in under 2 minutes during real-world testing.

### Using watch mode (best for hot-reload servers)

If the dev server supports hot-reload (Vite, nodemon, Next.js, webpack, ts-node-dev):

1. Edit the file
2. `watch_for_errors(duration_seconds: 15)` - blocks for 15 seconds, collects new errors
3. Check `hot_reload_detected` in the response - confirms the server actually reloaded
4. If `events` is empty and `hot_reload_detected` is true: fix is clean ✓
5. If errors found: read the error details, fix, call `watch_for_errors(10)` again

**Important caveat about `hot_reload_detected`:**
- In **start mode**, TracePulse owns the process and sees all stdout/stderr - hot-reload detection is reliable.
- In **attach mode** (tailing a log file), TracePulse only sees what's written to that specific log file. If your frontend (Vite) and backend (Python/Node) are separate processes, TracePulse tailing the backend log will NOT see Vite's HMR messages. `hot_reload_detected: false` in attach mode means "no reload seen in this log file" - not "no reload happened anywhere."
- When `hot_reload_detected` is `false` in attach mode, don't assume the change wasn't picked up. Use `get_errors` or `get_build_errors` as the reliable check instead.

### Investigating a specific error

When you see an error in `get_errors` and need more context:

1. `get_error_context(fingerprint: "<fingerprint>")` - returns:
   - The full error with untruncated details
   - Surrounding log events ±5 seconds (what happened before/after)
   - Total occurrence count
2. Read the source file at `context.file:context.line`
3. Check `get_error_trends(fingerprint: "<fingerprint>")` - is this new or recurring?

### Checking build/compilation errors

For TypeScript, ESLint, or bundler errors specifically:

1. `get_build_errors(limit: 10)` - returns only compilation errors
2. Each error has `context.file`, `context.line`, `context.error_type` (e.g., "TS2345")
3. Fix the build errors first - they block the dev server from serving updated code

### Correlating errors with your recent changes

When you're not sure which of your changes caused an error:

1. `correlate_with_diff()` - compares errors with your uncommitted git changes
2. Returns errors matched to changed files, sorted by signal score
3. Focus on errors in files you recently modified

### When the dev server crashes

1. `get_runtime_status()` - `connected: false` confirms the crash
2. `get_errors(limit: 3)` - the last errors before the crash are usually the cause
3. Look for `signal_strength: "high"` - these are crashes and unhandled exceptions
4. After fixing, the server should restart (or you restart it manually)
5. `get_runtime_status()` - verify `connected: true`

### Full-stack debugging (with Chrome DevTools MCP)

When a frontend page shows errors and you suspect a backend cause:

1. `get_errors(limit: 5)` - check backend for 500s or exceptions
2. Use Chrome DevTools MCP: `list_console_messages(types: ["error"])` - check browser
3. Use Chrome DevTools MCP: `list_network_requests(resourceTypes: ["fetch", "xhr"])` - find failed API calls
4. `get_correlated_errors(url: "/api/endpoint")` - match browser failures with backend traces
5. Fix the backend error, then verify both sides

### Starting a fresh debugging session

1. `clear_errors()` - reset the buffer for a clean slate
2. Trigger the failing action
3. `get_errors()` - see only errors from this action
4. `get_new_errors()` - if persistence is enabled, shows only errors never seen before

## Tool Reference (24 tools)

### Quick checks (start here)

| Tool | When to use | Cost |
|------|-------------|------|
| `get_runtime_status()` | First call in any session. Is the server running? How many errors? | ~100 tokens |
| `get_errors(since?, source?, service?, limit?)` | After any code change. Errors sorted by signal score (highest first). | ~1,000 tokens |

### Watch & verify

| Tool | When to use | Cost |
|------|-------------|------|
| `watch_for_errors(duration_seconds?, source?)` | After editing code - blocks N seconds, returns new errors. Best with hot-reload servers. | ~1,000 tokens |
| `get_build_errors(limit?)` | Check TypeScript/ESLint/Vite/webpack compilation errors specifically. | ~1,500 tokens |

### Deep investigation

| Tool | When to use | Cost |
|------|-------------|------|
| `get_error_context(fingerprint)` | Deep-dive into one error: full details + surrounding logs ±5s + occurrence count. | ~3,000 tokens |
| `get_timeline(since, duration_seconds?, limit?)` | See everything that happened in a time window - all levels, chronological. | ~5,000 tokens |
| `get_server_logs(level?, since?, limit?)` | Full server output at any severity level. | ~2,000 tokens |

### Cross-reference

| Tool | When to use | Cost |
|------|-------------|------|
| `correlate_with_diff()` | Link errors to your recent git changes. | ~1,000 tokens |
| `get_correlated_errors(url?)` | Match browser HTTP failures with backend stack traces. | ~2,000 tokens |
| `get_new_errors(limit?)` | Only errors with fingerprints not seen in previous sessions. | ~1,000 tokens |
| `get_error_trends(fingerprint)` | Is this error new or recurring? Cross-session history. | ~500 tokens |

### Management

| Tool | When to use | Cost |
|------|-------------|------|
| `clear_errors(fingerprint?)` | Reset buffer or clear a specific error by fingerprint. | ~50 tokens |
| `list_services()` | Multi-service mode: which services are running/crashed? | ~200 tokens |
| `get_health_summary()` | One-line health check: error count, warnings, uptime. Replaces 3 separate calls. | ~100 tokens |
| `verify_fix(duration_seconds?)` | All-in-one post-fix check: watches for errors + checks build + reports pass/fail verdict. | ~500 tokens |
| `restart_server()` | Kill and respawn the dev server (start mode only). | ~100 tokens |

### Infrastructure & project health

| Tool | When to use | Cost |
|------|-------------|------|
| `get_project_health()` | **Start here for any session.** Composite: server + infra + errors + build in one call. | ~200 tokens |
| `get_infra_status()` | Summary of all backend services (DB, Redis, etc.) with connectivity status. | ~200 tokens |
| `get_infra_detail(name)` | Per-service detail with probe history. Use after get_infra_status shows something unreachable. | ~200 tokens |
| `check_port(port)` | Is a port available or in use? Use before starting a server. | ~50 tokens |
| `get_requests(path?, limit?, status_code_min?)` | Recent HTTP requests filtered by path and status. | ~1,000 tokens |

### Error intelligence

| Tool | When to use | Cost |
|------|-------------|------|
| `get_error_clusters(min_count?)` | Group errors by type + module path. See patterns like "5 TypeErrors in src/api/". | ~500 tokens |
| `get_migration_status(framework?)` | Check pending migrations. Auto-detects alembic/prisma/django/knex. | ~200 tokens |
| `get_perf_baseline(path?, limit?)` | Per-endpoint P50/P95/max response times from HTTP access logs. | ~500 tokens |
| `get_audit_trail(limit?, since?)` | Review your own tool usage this session. Optimize your workflow. | ~500 tokens |

### Execution

| Tool | When to use | Cost |
|------|-------------|------|
| `run_and_watch(command, timeout_seconds?, cwd?)` | Run tests/linter/build, get parsed results. Use `cwd` for monorepos. | ~1,000 tokens |

## Workflow Examples

### Starting a new session
```
get_project_health()
```
One call tells you: is the server running? Any errors? Are databases/Redis reachable? Any build failures?

### "Something is broken but I don't know what"
```
1. get_project_health()     -> see if server, infra, or code is the problem
2. If infra unreachable:    -> get_infra_detail("PostgreSQL") -> check connection
3. If runtime errors:       -> get_errors(limit: 3) -> get_error_context(fingerprint)
4. If build errors:         -> get_build_errors() -> fix code
```

### "Is the database connected?"
```
get_infra_status()
```
Shows all services discovered from .env with reachable/unreachable status and latency.

### "Check dependencies and security"
```
run_and_watch("npm audit")       -> parsed vulnerability count
run_and_watch("npm outdated")    -> outdated packages
run_and_watch("pip audit")       -> Python security scan
```

### "Run tests with coverage"
```
run_and_watch("npx vitest --coverage")   -> parsed test results + coverage %
run_and_watch("pytest --cov")            -> parsed test results + coverage %
```

### "Server won't start - port in use"
```
check_port(3000)                 -> "Port 3000 is in use"
```

### "Restart after installing a dependency"
```
run_and_watch("pip install flask")
restart_server()
verify_fix(10)
```

## Key Fields in Error Responses

`get_errors` returns a structured object (not a plain array):

```json
{
  "errors": [...],           // Array of RuntimeEvent objects
  "total_matching": 15,      // Total errors matching filters (before limit)
  "session_started_at": ..., // When TracePulse started (Unix ms)
  "oldest_event_at": ...,    // Timestamp of oldest event in buffer (null if empty)
  "buffer_cleared_at": ...   // When clear_errors was last called (null if never)
}
```

If `session_started_at` is recent and `errors` is empty, the server is genuinely clean. If `session_started_at` is hours old, the data may be stale - consider restarting TracePulse.

Fields on each error in the `errors` array:

- **`signal_score`** / **`signal_strength`**: How important. Triage `high` first.
- **`context.file`** / **`context.line`**: Where in source code. Read this file.
- **`context.error_type`**: Exception class (e.g., "TypeError", "ImportError", "TS2345").
- **`fingerprint`**: Stable dedup ID. Pass to `get_error_context` or `get_error_trends`.
- **`occurrence_count`**: How many times this exact error has occurred.
- **`source`**: Where the line came from - `server-stdout`, `server-stderr`, or `build-error`.
- **`service`**: Which process (in multi-service mode) - `main`, `api`, `worker`, etc.

## Progressive Disclosure (save tokens)

Start cheap, drill down only when needed:

1. **`get_project_health`** (~200 tokens) - server + infra + errors + build in one call. **Start here.**
2. **`get_errors`** (~1,000 tokens) - what broke? sorted by severity
3. **`get_error_context`** (~3,000 tokens) - full details on one specific error
4. **`get_infra_detail`** (~200 tokens) - per-service connectivity detail
5. **`get_timeline`** (~5,000 tokens) - everything that happened in a time window

Don't call `get_timeline` or `get_server_logs` unless you need the full picture. `get_project_health` -> `get_errors` covers 90% of cases.

## Pro Tips

### Use `message_contains` to filter by URL path
Instead of scanning all logs, filter directly:
- `get_errors(message_contains: "/api/export")` - only errors mentioning this path
- `get_server_logs(message_contains: "500")` - only lines with "500"
- `get_server_logs(message_contains: "/export", level: "error")` - combine filters

### Use `since` as a cursor to avoid re-reading old events
Save the timestamp from your last call and pass it next time:
1. First call: `get_errors()` → note the `session_started_at` or latest event timestamp
2. After making changes: `get_errors(since: <that_timestamp>)` → only new events
This avoids re-processing errors you already investigated.

### Bridge frontend errors manually

### NEVER run interactive CLI tools via shell
Database CLIs (`psql`, `mysql`, `sqlite3`, `redis-cli`, `mongo`) prompt for passwords interactively and will hang your session indefinitely. Instead:
- **For migration checks:** use `get_migration_status()` - auto-detects framework, reads credentials from .env
- **For DB queries:** use `run_and_watch("PGPASSWORD=$DB_PASS psql -h localhost -U user -d dbname -c 'SELECT ...'")` with credentials from .env
- **For Redis/Mongo:** use `run_and_watch("redis-cli -a $REDIS_PASS ping")` with credentials from .env
- **General rule:** if a CLI tool might prompt for input, pass credentials via environment variables or flags, never interactively

### Bridge frontend errors manually
When `get_correlated_errors` returns empty (no frontend source configured):
1. Chrome DevTools MCP: `list_network_requests(resourceTypes: ["fetch", "xhr"])` → find failed requests
2. Note the URL and status code of the failure
3. TracePulse: `get_errors(message_contains: "/api/that-endpoint")` → find matching backend error
This is 2 calls instead of the automated correlation, but works in any setup.

## What TracePulse Does NOT Do

- Does not set breakpoints or step through code (use mcp-debugger for that)
- Does not inspect the browser DOM or console (use Chrome DevTools MCP for that)
- Does not inspect the visual UI (use ViewGraph for that)
- Does not modify code or fix errors - it only reports what the dev server outputs
- Does not run type checkers - but it parses TypeScript compiler output if your dev server runs `tsc`

## When to Use TracePulse vs Chrome DevTools MCP

Use this decision tree when debugging. The right tool depends on where the problem is.

### "Did my code change break anything?"
→ **TracePulse**: `get_build_errors()` - instant compilation check
→ **TracePulse**: `get_errors()` - runtime errors from the server

### "The page shows a blank state / error / spinner that won't stop"
→ **Chrome DevTools MCP**: `list_network_requests(resourceTypes: ["fetch", "xhr"])` - find failed API calls
→ **Chrome DevTools MCP**: `list_console_messages(types: ["error"])` - find JS errors
→ Then **TracePulse**: `get_errors()` - check if the backend has matching errors

### "I got a 401/403 Unauthorized"
→ **Chrome DevTools MCP**: `get_network_request(reqid)` - see the full request headers, auth token, response body
→ This is a browser-side problem (wrong token, expired session). TracePulse won't see it unless the backend logs the rejection.

### "I got a 500 Internal Server Error"
→ **TracePulse**: `get_errors()` - the backend exception with stack trace
→ **TracePulse**: `get_error_context(fingerprint)` - surrounding logs for context
→ **Chrome DevTools MCP**: `get_network_request(reqid)` - see what request triggered it

### "I need to see the request/response body"
→ **Chrome DevTools MCP**: `get_network_request(reqid)` - full request and response bodies
→ TracePulse only sees what the server prints to stdout/stderr. It doesn't capture HTTP bodies.

### "A request is slow"
→ **Chrome DevTools MCP**: `list_network_requests()` - check response times
→ **Chrome DevTools MCP**: `performance_start_trace()` - detailed performance profile
→ TracePulse doesn't track request timing (yet).

### "I want to verify my fix worked end-to-end"
1. **TracePulse**: `watch_for_errors(15)` or `get_build_errors()` - backend clean?
2. **Chrome DevTools MCP**: `navigate_page(type: "reload")` - reload the page
3. **Chrome DevTools MCP**: `wait_for("expected content")` - page renders correctly?
4. **Chrome DevTools MCP**: `list_console_messages(types: ["error"])` - no JS errors?

### "I want to correlate frontend and backend errors"
→ **TracePulse**: `get_correlated_errors(url: "/api/endpoint")` - if correlation is configured
→ Or manually: **Chrome DevTools MCP** `list_network_requests()` to find the failed request, then **TracePulse** `get_errors()` to find the matching backend exception

### Quick reference

| I need to see... | Use |
|-------------------|-----|
| Backend exceptions, stack traces | TracePulse `get_errors` |
| Build/compilation errors | TracePulse `get_build_errors` |
| Backend logs around an error | TracePulse `get_error_context` |
| Browser console errors | Chrome DevTools MCP `list_console_messages` |
| Failed HTTP requests from browser | Chrome DevTools MCP `list_network_requests` |
| Request/response headers and body | Chrome DevTools MCP `get_network_request` |
| Page content after a change | Chrome DevTools MCP `take_snapshot` |
| Visual layout/styling | Chrome DevTools MCP `take_screenshot` |
| Whether hot-reload happened | TracePulse `watch_for_errors` (start mode only) |
| Which git changes caused an error | TracePulse `correlate_with_diff` |
