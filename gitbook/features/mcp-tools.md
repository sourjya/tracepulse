# 35 MCP Tools

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
| `get_new_errors(limit?)` | Only errors with unseen fingerprints | ~1,000 tokens |
| `get_error_trends(fingerprint)` | Cross-session frequency and history | ~500 tokens |

## Management

| Tool | What it does | Cost |
|------|-------------|------|
| `clear_errors(fingerprint?)` | Clear all or specific errors | ~50 tokens |
| `list_services()` | Service names, statuses, error counts | ~200 tokens |
| `get_health_summary()` | One-line health check replacing 3 calls | ~100 tokens |
| `verify_fix(duration_seconds?)` | All-in-one post-fix: watch + build + pass/fail | ~500 tokens |
| `restart_server()` | Kill and respawn dev server (start mode only) | ~100 tokens |

## Infrastructure & Project Health

| Tool | What it does | Cost |
|------|-------------|------|
| `get_project_health()` | **Start here.** Server + infra + errors + build in one call | ~200 tokens |
| `get_infra_status()` | All backend services (DB, Redis, etc.) with connectivity | ~200 tokens |
| `get_infra_detail(name)` | Per-service detail with probe history | ~200 tokens |
| `check_port(port)` | Is a TCP port available or in use? | ~50 tokens |

## Error Intelligence

| Tool | What it does | Cost |
|------|-------------|------|
| `get_error_clusters(min_count?)` | Group errors by type + module path. See patterns across the codebase. | ~500 tokens |
| `get_migration_status(framework?)` | Check pending migrations. Auto-detects alembic/prisma/django/knex. | ~200 tokens |
| `get_perf_baseline(path?, limit?)` | Per-endpoint P50/P95/max response times from HTTP access logs. | ~500 tokens |
| `get_audit_trail(limit?, since?)` | Review your own tool usage this session. Optimize your workflow. | ~500 tokens |
