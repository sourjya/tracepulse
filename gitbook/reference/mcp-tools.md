# MCP Tools Reference

TracePulse exposes 42 MCP tools that any AI coding agent can call. Tools are organized by workflow - start with quick checks, then dig deeper as needed.

{% hint style="info" %}
**Token costs** are approximate response sizes. The agent's MCP client loads all tool schemas (~1,000 tokens) once per session. Individual tool calls cost only their response size.
{% endhint %}

## Where to start

Most debugging sessions follow this pattern:

1. **`get_project_health`** - one call to see server status, infrastructure, errors, and build state
2. **`get_errors`** - if errors exist, read them sorted by importance
3. **`get_error_context`** - deep-dive into a specific error
4. Fix the code
5. **`verify_fix`** - confirm the fix worked

---

## Quick Checks

Tools for getting a fast read on the current state. Low token cost, high information density.

| Tool | Parameters | Description | ~Tokens |
|------|-----------|-------------|---------|
| `get_project_health` | none | **Start here.** Server + infra + errors + build in one call. | 200 |
| `get_runtime_status` | none | Is the server running? Error count, session uptime. | 100 |
| `get_health_summary` | none | One-line summary: error count, warning count, total events, uptime. | 100 |
| `get_errors` | `since?`, `source?`, `service?`, `limit?`, `message_contains?`, `status_code_min?` | Errors sorted by signal score (highest first). Auto-filters resolved and expired transient errors. | 1,000 |
| `verify_mcp` | `command`, `timeout_seconds?` | Test that an MCP server starts and responds to the initialize handshake. Returns server name, version, and capabilities. | 200 |

## Watch and Verify

Tools that block and wait for something to happen. Use after making code changes.

| Tool | Parameters | Description | ~Tokens |
|------|-----------|-------------|---------|
| `verify_fix` | `duration_seconds?`, `fingerprint?` | All-in-one post-fix check: watches for errors, checks build, returns PASS or FAIL. Pass `fingerprint` to verify a specific error is resolved. | 500 |
| `watch_for_errors` | `duration_seconds?`, `source?` | Block for N seconds, collect new errors after hot-reload. Returns `hot_reload_detected: true` if the server reloaded. | 1,000 |
| `wait_for_build` | `timeout_seconds?` | Block until the next build/hot-reload completes. Event-driven, no polling. | 200 |
| `wait_for_event` | `type?`, `timeout_seconds?` | Block until the next event of a specific type: `error`, `warning`, `build`, `crash`, or `any`. | 200 |
| `get_build_errors` | `limit?` | TypeScript, ESLint, Vite/webpack compilation errors only. Filters to `source: build-error`. | 1,500 |

## Execute and Parse

Run commands through TracePulse's parser pipeline instead of raw shell.

| Tool | Parameters | Description | ~Tokens |
|------|-----------|-------------|---------|
| `run_and_watch` | `command`, `timeout_seconds?`, `cwd?` | Run tests, linters, or type checkers. Returns structured pass/fail with parsed errors. `cwd` for monorepo subdirectories. | 1,000 |
| `verify_build` | `typecheck_command?`, `build_command?`, `cwd?` | Type-check + build + runtime error check in one call. Commands restricted to known safe values. | 500 |
| `get_requests` | `path?`, `limit?`, `status_code_min?` | Recent HTTP requests from access logs. Filter by URL path and minimum status code. | 1,000 |

## Deep Investigation

Tools for understanding a specific error in detail. Higher token cost, richer context.

| Tool | Parameters | Description | ~Tokens |
|------|-----------|-------------|---------|
| `get_error_context` | `fingerprint` | Full error + surrounding logs within +/-5 seconds + occurrence count. The go-to tool for understanding what happened around an error. | 3,000 |
| `get_timeline` | `since`, `duration_seconds?`, `limit?` | Unified chronological stream of ALL events in a time window. Use for full situational awareness. | 5,000 |
| `get_server_logs` | `level?`, `since?`, `limit?`, `message_contains?`, `status_code_min?` | All log events at any severity, sorted by timestamp (newest first). | 2,000 |

## Cross-Reference and Correlation

Tools that connect errors to causes - git changes, frontend failures, historical patterns.

| Tool | Parameters | Description | ~Tokens |
|------|-----------|-------------|---------|
| `correlate_with_diff` | none | Link recent errors to uncommitted git changes. Shows which errors may be caused by your recent edits. | 1,000 |
| `get_correlated_errors` | `url?` | Match browser HTTP failures with backend stack traces. Returns paired errors with confidence scores. | 2,000 |
| `get_cross_layer_diagnosis` | `time_window_seconds?` | Cross-layer failure diagnosis. Correlates backend logs, frontend errors, git state, and process state to identify root causes spanning multiple layers. Returns diagnoses with confidence scores and proposed fixes. | 500 |
| `get_new_errors` | `limit?` | Only errors with fingerprints not seen in previous sessions. Requires `--persist`. | 1,000 |
| `get_error_trends` | `fingerprint` | Cross-session frequency and history for a specific fingerprint. Requires `--persist`. | 500 |

## Error Intelligence

Tools for pattern detection and codebase-level insights.

| Tool | Parameters | Description | ~Tokens |
|------|-----------|-------------|---------|
| `get_error_clusters` | `min_count?` | Group errors by type + module path. Reveals patterns across the codebase. | 500 |
| `get_bug_patterns` | none | Cross-session patterns: recurring bugs, velocity changes, error chains, flaky errors, regressions. Requires `--persist`. | 500 |
| `get_perf_baseline` | `path?`, `limit?` | Per-endpoint response time percentiles (P50, P95, max) from HTTP access logs. | 500 |
| `get_migration_status` | `framework?`, `apply?` | Check or run pending migrations. Auto-detects alembic, prisma, django, knex. | 200 |
| `check_drift` | none | Unified env, dependency, and migration drift detection in one call. | 300 |

## Infrastructure

Tools for checking backend services and connectivity.

| Tool | Parameters | Description | ~Tokens |
|------|-----------|-------------|---------|
| `get_infra_status` | none | All discovered backend services (databases, Redis, queues) with connectivity status. Reads from .env files, probes every 60s. | 200 |
| `get_infra_detail` | `name` | Detailed status for a specific service including connection history. | 200 |
| `check_port` | `port` or `ports` | Check if TCP port(s) are available or in use on localhost. | 50 |
| `free_port` | `port` | Kill the process occupying a port. Use when start_server fails because a port is in use. | 50 |
| `register_probe` | `name`, `url`, `method?`, `expect_status?`, `interval_seconds?` | Register a health endpoint for periodic checking. | 100 |
| `list_probes` | none | All registered probes with their latest results (pass/fail/error). | 100 |

## Session and Management

Tools for managing the current session, reviewing your workflow, and housekeeping.

| Tool | Parameters | Description | ~Tokens |
|------|-----------|-------------|---------|
| `get_session_summary` | none | Compact session manifest: errors seen, builds detected, tools called. ~200 tokens. | 200 |
| `get_session_insights` | none | Agent effectiveness report: uninvestigated errors, verification gaps, parser stats, recommendations. | 500 |
| `get_session_impact` | none | Environmental report: tokens saved, energy in Wh, CO2 in grams. | 200 |
| `get_audit_trail` | `limit?`, `since?` | Review your own MCP tool usage this session. Shows which tools were called, when, and response sizes. | 500 |
| `acknowledge_error` | `fingerprint` | Mark an error as investigated. Excluded from future `get_errors` results. | 50 |
| `clear_errors` | `fingerprint?` | Clear all events or a specific fingerprint from the buffer. | 50 |
| `list_services` | none | All monitored services with status, error count, and last activity. | 200 |
| `restart_server` | none | Kill and respawn the dev server process. Only works in start mode. | 100 |
| `start_server` | `command`, `env?`, `cwd?`, `name?` | Start a dev server mid-session. Pre-validates command, activates Layer 2 tools on success. | 100 |
| `stop_server` | `name?` | Stop a running dev server. Sends SIGTERM. | 50 |
