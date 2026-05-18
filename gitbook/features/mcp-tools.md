# 42 MCP Tools

Every tool the agent can call, organized by workflow.

## Quick Checks

| Tool | What it does | Cost |
|------|-------------|------|
| `get_runtime_status()` | Is the server running? Error count, session uptime. | ~100 tokens |
| `get_health_summary()` | One-line: "3 errors, 1 warning, 47 events, uptime 12min" | ~100 tokens |
| `get_errors(since?, source?, service?, limit?, message_contains?, status_code_min?)` | Errors sorted by signal score. Freshness metadata included. | ~1,000 tokens |

## Watch & Verify

| Tool | What it does | Cost |
|------|-------------|------|
| `verify_fix(duration_seconds?)` | All-in-one: watch + build check + pass/fail verdict | ~500 tokens |
| `watch_for_errors(duration_seconds?, source?)` | Block N seconds, collect new errors | ~1,000 tokens |
| `wait_for_build(timeout_seconds?)` | Block until next build completes (event-driven) | ~200 tokens |
| `wait_for_event(type?, timeout_seconds?)` | Block until next error/warning/build/crash event | ~200 tokens |
| `get_build_errors(limit?)` | TypeScript/ESLint/Vite/webpack errors only | ~1,500 tokens |

## Execute & Parse

| Tool | What it does | Cost |
|------|-------------|------|
| `run_and_watch(command, timeout_seconds?, cwd?)` | Run tests/linter/typechecker, get parsed results. Use `cwd` for monorepos. | ~1,000 tokens |
| `get_requests(path?, limit?, status_code_min?)` | Recent HTTP requests filtered by path and status | ~1,000 tokens |

## Deep Investigation

| Tool | What it does | Cost |
|------|-------------|------|
| `get_error_context(fingerprint)` | Full error + surrounding logs +/-5s + occurrence count | ~3,000 tokens |
| `get_timeline(since, duration_seconds?, limit?)` | Chronological stream of all events | ~5,000 tokens |
| `get_server_logs(level?, since?, limit?, message_contains?, status_code_min?)` | All log events at any severity | ~2,000 tokens |

## Cross-Reference

| Tool | What it does | Cost |
|------|-------------|------|
| `correlate_with_diff()` | Link errors to uncommitted git changes | ~1,000 tokens |
| `get_correlated_errors(url?)` | Match browser failures with backend traces | ~2,000 tokens |
| `get_cross_layer_diagnosis(time_window_seconds?)` | Cross-layer failure diagnosis. Correlates backend, frontend, git, and process signals into root-cause diagnoses. | ~500 tokens |
| `get_new_errors(limit?)` | Only errors with unseen fingerprints | ~1,000 tokens |
| `get_error_trends(fingerprint)` | Cross-session frequency and history | ~500 tokens |

## Management

| Tool | What it does | Cost |
|------|-------------|------|
| `clear_errors(fingerprint?)` | Clear all or specific errors | ~50 tokens |
| `list_services()` | Service names, statuses, error counts | ~200 tokens |
| `get_health_summary()` | One-line health check replacing 3 calls | ~100 tokens |
| `verify_fix(duration_seconds?)` | All-in-one post-fix: watch + build + pass/fail | ~500 tokens |
| `start_server(command, env?, cwd?, name?)` | Start a dev server mid-session. Pre-validates, activates monitoring. | ~100 tokens |
| `stop_server(name?)` | Stop a running dev server. SIGTERM → wait → SIGKILL. | ~50 tokens |
| `restart_server()` | Kill and respawn dev server (start mode only) | ~100 tokens |

## Infrastructure & Project Health

| Tool | What it does | Cost |
|------|-------------|------|
| `get_project_health()` | **Start here.** Server + infra + errors + build in one call | ~200 tokens |
| `get_infra_status()` | All backend services (DB, Redis, etc.) with connectivity | ~200 tokens |
| `get_infra_detail(name)` | Per-service detail with probe history | ~200 tokens |
| `check_port(port)` | Is a TCP port available or in use? | ~50 tokens |
| `register_probe(name, url)` | Register a health endpoint for periodic checking | ~100 tokens |
| `list_probes()` | All registered probes with latest results | ~100 tokens |
| `verify_mcp(command, timeout_seconds?)` | Test that an MCP server starts and responds to initialize handshake | ~200 tokens |

## Error Intelligence

| Tool | What it does | Cost |
|------|-------------|------|
| `get_error_clusters(min_count?)` | Group errors by type + module path. See patterns across the codebase. | ~500 tokens |
| `get_migration_status(framework?)` | Check pending migrations. Auto-detects alembic/prisma/django/knex. | ~200 tokens |
| `get_perf_baseline(path?, limit?)` | Per-endpoint P50/P95/max response times from HTTP access logs. | ~500 tokens |
| `get_audit_trail(limit?, since?)` | Review your own tool usage this session. Optimize your workflow. | ~500 tokens |

## Session & Behavior

| Tool | What it does | Cost |
|------|-------------|------|
| `get_session_summary()` | Compact ~200-token session manifest: errors, builds, tools called | ~200 tokens |
| `get_session_insights()` | Agent effectiveness: uninvestigated errors, verification gaps, recommendations | ~500 tokens |
| `get_session_impact()` | Environmental report: tokens saved, energy (Wh), CO2 (g) | ~200 tokens |
| `acknowledge_error(fingerprint)` | Mark error as investigated. Excluded from future get_errors results. | ~50 tokens |
| `check_drift()` | Check env, dependency, and migration drift in one call | ~300 tokens |
| `verify_build(typecheck_command?, build_command?, cwd?)` | Type-check + build + runtime error check in one call | ~500 tokens |

---

## Tool Details

### get\_errors

The primary error discovery tool. Returns errors and warnings sorted by signal score (highest first).

**Parameters:** `since?` (Unix ms), `source?`, `service?`, `limit?` (default 20), `message_contains?`, `status_code_min?`

When [bug patterns](bug-patterns.md) are detected, errors include a `patterns` field with recurring/flaky/fixed-but-back annotations.

### verify\_fix

All-in-one post-fix verification. Watches for errors after a code change, checks build status, returns PASS or FAIL.

**Parameters:** `duration_seconds?` (default 15), `fingerprint?` (verify a specific error is resolved)

Call this after every code change. If you pass a fingerprint from `get_errors`, it specifically checks whether that error is gone.

### run\_and\_watch

Run any command through TracePulse's 26 parsers. Returns structured pass/fail with parsed errors. Use instead of shell for tests, builds, and linters.

**Parameters:** `command` (required), `timeout_seconds?` (default 60), `cwd?` (for monorepos)

```
run_and_watch("npx vitest run")
run_and_watch("pytest tests/", cwd: "./backend")
run_and_watch("npx tsc --noEmit")
```

### get\_project\_health

Composite health check in one call: server status, infrastructure connectivity, error count, build status. **Start every debugging session here.**

No parameters. Returns `healthy: true/false` with a summary.

### get\_build\_errors

Returns only build/compilation errors (TypeScript, ESLint, Vite/webpack). Filters to `source: build-error`.

**Parameters:** `limit?` (default 20)

### watch\_for\_errors

Block for N seconds and collect new errors. Returns `hot_reload_detected: true` if the server reloaded during the watch window.

**Parameters:** `duration_seconds?` (default 15), `source?`

### get\_error\_context

Deep-dive into a specific error. Returns the full error, surrounding logs within +/-5 seconds, and occurrence count.

**Parameters:** `fingerprint` (required)

### verify\_build

Type-check + build + runtime error check in one call. Replaces 3 separate tool calls.

**Parameters:** `typecheck_command?` (default `npx tsc --noEmit`), `build_command?` (default `npx vite build`), `cwd?`

### check\_drift

Unified drift detection: missing .env vars, stale lock files, pending migrations. One call replaces manual checks.

No parameters.

### correlate\_with\_diff

Link recent errors to uncommitted git changes. Shows which errors may be caused by your recent edits.

No parameters. Requires a git repository.

### get\_error\_clusters

Group errors by type + module path. Reveals patterns like "5 TypeErrors in src/api/".

**Parameters:** `min_count?` (default 2)

### clear\_errors

Reset the event buffer. Pass `fingerprint` to clear a specific error, or omit to clear all.

**Parameters:** `fingerprint?`

### get\_infra\_status

Summary of all discovered backend services (databases, Redis, queues) with connectivity status. Reads from .env files, probes every 60 seconds.

No parameters.

### get\_migration\_status

Check or run pending database migrations. Auto-detects alembic, prisma, django, knex.

**Parameters:** `framework?`, `apply?` (set true to run migrations)

### get\_session\_insights

Agent effectiveness report: uninvestigated errors, verification gaps, tool usage patterns, parser stats. Use at end of session.

No parameters.
