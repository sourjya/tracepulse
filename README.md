# TracePulse

<img src="gitbook/.gitbook/assets/tracepulse-logo.png" alt="TracePulse" width="120" align="right"/>

[![npm version](https://img.shields.io/npm/v/tracepulse)](https://www.npmjs.com/package/tracepulse)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Tests](https://img.shields.io/badge/tests-860%20passing-brightgreen)]()

**Runtime feedback MCP server for AI coding agents.**

*Fewer wasted tokens. Faster shipping. Lower carbon footprint. Responsible AI in action.*

[ViewGraph](https://chaoslabz.gitbook.io/viewgraph) sees the UI. TracePulse hears the backend.

> "LLMs can't see what happens when their code actually runs. They're throwing darts in the dark." - [Sentry Engineering](https://blog.sentry.io/vibe-coding-closing-the-feedback-loop-with-traceability/)
>
> TracePulse closes this loop at dev time - seconds after the code change, not minutes after deployment.

TracePulse watches your dev server's stdout/stderr, parses errors into structured events with signal scoring, and exposes them as MCP tools that any AI coding agent can call. The agent edits code, calls `get_errors`, and instantly knows if the fix worked - no manual log reading, no copy-paste.

## Status

🟡 **Alpha v0.9.8 - Phases 1-5 complete.** [Core pipeline](docs/architecture/architecture-guide.md#the-data-pipeline), [watch mode](docs/architecture/architecture-guide.md#mcp-tools---what-the-agent-can-call), [multi-process support](docs/architecture/architecture-guide.md#multi-process-architecture-phase-3), [frontend-backend correlation](docs/architecture/architecture-guide.md#frontend-backend-correlation-phase-4), proactive monitoring. [26 error parsers](docs/architecture/architecture-guide.md#error-parsers---what-languages-are-supported), [36 MCP tools](docs/architecture/architecture-guide.md#mcp-tools---what-the-agent-can-call), [860 tests](tests/) passing.

## Quick Start

Add TracePulse to your MCP client's config file. The file location depends on which tool you use:

### Config File Locations

| MCP Client | Config File |
|------------|-------------|
| **Kiro CLI** | `.kiro/settings/mcp.json` (in your project) |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |
| **Claude Desktop** | `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| **Cursor** | `.cursor/mcp.json` (in your project) |
| **VS Code (Copilot)** | `.vscode/mcp.json` (in your project) |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Generic** | `.mcp.json` (in your project root) |

> ⚠️ **Common mistake:** Kiro CLI uses `.kiro/settings/mcp.json`, not `.kiro/mcp.json`. If TracePulse tools don't appear, check you're editing the right file.

### Start mode - spawn and monitor your dev server

**Node.js projects** (npm/pnpm/Bun available in project):
```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "npx",
      "args": ["tracepulse", "start", "npm run dev"]
    }
  }
}
```

**Python, Go, Java, Rust, or any non-Node project:**

Node.js may not be on your project's PATH. Install TracePulse globally once:
```bash
npm install -g tracepulse
```
Then use the global binary directly:
```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse",
      "args": ["start", "python manage.py runserver"]
    }
  }
}
```

Replace the command with your dev server: `uvicorn main:app --reload`, `go run main.go`, `mvn spring-boot:run`, `cargo run`, etc.

### Attach mode - tail an existing log file

Use this when your servers are already running (managed by scripts, Docker, process managers, etc.):

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "npx",
      "args": ["tracepulse", "attach", "--log-file", "./logs/server.log"]
    }
  }
}
```

### Local development (without npm publish)

Point directly to the built CLI:

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "node",
      "args": ["/path/to/tracepulse/dist/cli.js", "start", "npm run dev"]
    }
  }
}
```

### Which mode should I use?

| Situation | Mode |
|-----------|------|
| Simple `npm run dev` or `python manage.py runserver` | **start** - TracePulse spawns it |
| Servers managed by scripts, Docker, tmux, pm2 | **attach** - TracePulse tails the log file |
| Fresh project, library, or no server yet | **standalone** - tools only, no collector |
| Multiple services (API + worker + frontend) | **start --service** or **config file** |
| Docker Compose setup | **compose** |

## MCP Tools

### Core (Phase 1)

| Tool | Description | Tokens |
|------|-------------|--------|
| `get_errors(since?, source?, service?, limit?)` | Recent errors sorted by signal score (highest first) | ~1,000 |
| `get_server_logs(level?, since?, limit?)` | All log events sorted by timestamp (newest first) | ~2,000 |
| `get_runtime_status()` | Health check: connected, error count, correlation source | ~100 |
| `clear_errors()` | Reset the event buffer for a clean verification cycle | ~50 |

### Watch Mode (Phase 2)

| Tool | Description | Tokens |
|------|-------------|--------|
| `watch_for_errors(duration_seconds?, source?)` | Block for N seconds, collect new errors after hot-reload | ~1,000 |
| `get_build_errors(limit?)` | TypeScript, ESLint, Vite/webpack compilation errors | ~1,500 |
| `get_error_context(fingerprint)` | Deep-dive: full error + surrounding logs ±5s + occurrence count | ~3,000 |
| `get_timeline(since, duration_seconds?, limit?)` | Unified chronological stream of all events | ~5,000 |

### Multi-Process (Phase 3)

| Tool | Description | Tokens |
|------|-------------|--------|
| `list_services()` | Service names, statuses, error counts, last activity | ~200 |

### Correlation (Phase 4)

| Tool | Description | Tokens |
|------|-------------|--------|
| `get_correlated_errors(url?)` | Match browser HTTP failures with backend stack traces | ~2,000 |

### Proactive (Phase 5)

| Tool | Description | Tokens |
|------|-------------|--------|
| `get_new_errors(limit?)` | Only errors with fingerprints not seen in previous sessions | ~1,000 |
| `get_error_trends(fingerprint)` | Cross-session frequency and history for a fingerprint | ~500 |
| `correlate_with_diff()` | Link errors to recent uncommitted git changes | ~1,000 |

### Execution & Health

| Tool | Description | Tokens |
|------|-------------|--------|
| `run_and_watch(command, timeout_seconds?, cwd?)` | Run tests/linter/typechecker, get parsed results. `cwd` for monorepos. | ~1,000 |
| `get_requests(path?, limit?, status_code_min?)` | Recent HTTP requests filtered by path and status | ~1,000 |
| `get_health_summary()` | One-line health check: errors, warnings, uptime | ~100 |
| `verify_fix(duration_seconds?)` | All-in-one post-fix verification with pass/fail verdict | ~500 |
| `wait_for_build(timeout_seconds?)` | Block until next build completes (event-driven) | ~200 |
| `wait_for_event(type?, timeout_seconds?)` | Block until next error/warning/build/crash event | ~200 |

### Error Intelligence

| Tool | Description | Tokens |
|------|-------------|--------|
| `get_error_clusters(min_count?)` | Group errors by type + module path. See patterns across the codebase. | ~500 |
| `get_migration_status(framework?)` | Check pending migrations. Auto-detects alembic/prisma/django/knex. | ~200 |
| `get_perf_baseline(path?, limit?)` | Per-endpoint P50/P95/max response times from HTTP access logs. | ~500 |
| `get_audit_trail(limit?, since?)` | Review tool usage this session. Optimize your workflow. | ~500 |

## Error Parsers

TracePulse parses errors from 25 sources out of the box:

**Runtime errors:**
- **Node.js** - TypeError, ReferenceError, SyntaxError, etc. with V8 stack traces
- **Python** - Tracebacks with file:line extraction
- **Go** - Panics with goroutine stack traces
- **Java** - Exceptions with `at` frames and `Caused by:` chains
- **Rust** - Panics with `RUST_BACKTRACE` output
- **JSON** - Structured logs (pino, structlog JSON, logback) with level/message fields
- **Structlog** - Python structlog key-value format (`[info]`, `[warning]`, `[error]` brackets)

**Build errors:**
- **TypeScript** - `tsc` compiler errors (TS####)
- **ESLint** - Lint errors with rule names
- **Vite/webpack** - Build tool errors (module not found, transform failures)
- **Build Stats** - Module count, build time from Vite/webpack

**Test runners:**
- **pytest** - FAILED, ERROR, summary lines
- **Jest** - FAIL header, assertion details
- **vitest** - FAIL file, Expected/Received
- **Go test** - `--- FAIL`, error with file:line
- **cargo test** - test FAILED, panic with file:line, summary
- **JUnit/Maven/Gradle** - Surefire summary, Gradle task FAILED, AssertionError

**Infrastructure:**
- **HTTP Access Log** - uvicorn, express/morgan, nginx with status and duration
- **Migration** - alembic and Django migration output

**Background workers:**
- **Celery** - task raised/retry/timeout/succeeded
- **Sidekiq** - WARN/ERROR/FATAL job events, done timing
- **BullMQ** - job failed/stalled/completed, queue errors

## Signal Scoring

Every event gets a `signal_score` (0–100) and `signal_strength` (high/medium/low):

| Signal | Score | Example |
|--------|-------|---------|
| **high** | ≥ 50 | Unhandled exception with user-code stack trace |
| **medium** | 20–49 | Error log without stack trace, HTTP 4xx |
| **low** | < 20 | Warning, deprecation notice, hot-reload marker |

## CLI Usage

```bash
# Single process - spawn and monitor
tracepulse start "npm run dev"
```
Spawns your dev server as a child process, captures its stdout/stderr, and monitors for errors. TracePulse manages the process lifecycle - forwards SIGTERM/SIGKILL on shutdown.

```bash
# Attach to existing log file
tracepulse attach --log-file ./server.log
```
Tails an existing log file without spawning any process. Use when your servers are already running - managed by Docker, tmux, pm2, systemd, or custom scripts.

```bash
# Multi-process - monitor multiple services
tracepulse start --service api="npm run dev:api" --service worker="npm run worker"
```
Spawns multiple services simultaneously. Each service's output is tagged with its name - filter with `get_errors(service: "api")` or see all with `list_services()`.

```bash
# Config file
tracepulse start --config tracepulse.config.json
```
Reads service definitions, transport settings, and persistence options from a JSON config file instead of CLI flags. See [Configuration](docs/architecture/architecture-guide.md) for the schema.

```bash
# Docker Compose
tracepulse compose --file docker-compose.yml
```
Discovers services from a Docker Compose file and tails their container logs via the Docker Engine API. Each container's output is tagged with its compose service name.

```bash
# With persistence (saves fingerprints across sessions)
tracepulse start --persist "npm run dev"
```
Saves error fingerprints to `.tracepulse/fingerprints.json` on shutdown, loads them on startup. Enables `get_new_errors()` (only unseen fingerprints) and `get_error_trends()` (cross-session history).

```bash
# With HTTP transport (for multi-client scenarios)
tracepulse start --http "npm run dev"
```
Starts a Streamable HTTP server on `127.0.0.1:9800` alongside the default stdio transport. Allows multiple MCP clients to connect to the same TracePulse instance simultaneously.

## Why `run_and_watch` Instead of Shell

`run_and_watch` isn't just a convenience - it solves real reliability problems:

**Structured output.** Shell commands return raw text the agent must parse. `run_and_watch` returns structured JSON with pass/fail counts, error details, and file:line references.

**WSL reliability.** On WSL (Windows Subsystem for Linux), terminal output capture is unreliable - Kiro IDE and other tools often can't read test results from the terminal. `run_and_watch` bypasses this entirely because it captures output via Node.js pipes and returns data over the MCP protocol (JSON-RPC over stdio), a completely separate channel from the terminal.

**Monorepo support.** The `cwd` parameter runs commands in subdirectories without `cd` prefix hacks:
```
run_and_watch("npx vitest run", cwd: "./frontend")
run_and_watch("pytest tests/", cwd: "./backend")
```

**Parser pipeline.** Output flows through TracePulse's 25 parsers, so test failures, build errors, and runtime crashes are all normalized into the same structured format the agent already knows.

## Cloud Log Monitoring

Monitor cloud service logs with zero additional dependencies - uses your existing cloud CLIs:

| Platform | Command |
|----------|---------|
| **[AWS CloudWatch](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)** | `run_and_watch("aws logs tail /aws/lambda/my-fn --follow")` |
| **[Google Cloud](https://cloud.google.com/sdk/docs/install)** | `run_and_watch("gcloud logging tail '...'")` |
| **[Azure](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)** | `run_and_watch("az webapp log tail --name my-app")` |
| **[Kubernetes](https://kubernetes.io/docs/tasks/tools/)** | `run_and_watch("kubectl logs -f deployment/my-app")` |
| **[Docker](https://docs.docker.com/get-started/get-docker/)** | `run_and_watch("docker logs -f my-container")` |
| **[Heroku](https://devcenter.heroku.com/articles/heroku-cli)** | `run_and_watch("heroku logs --tail --app my-app")` |
| **[Vercel](https://vercel.com/docs/cli)** / **[Railway](https://docs.railway.com/guides/cli)** / **[Fly.io](https://fly.io/docs/flyctl/install/)** | Same pattern with their CLIs |

The same 26 parsers that catch local dev server errors catch cloud errors too.

## Hot-Reload Detection

TracePulse detects hot-reload events from 8 dev tools:

- **Vite** - compilation success, HMR updates
- **webpack** - compilation completed
- **nodemon** - restart/starting events
- **Next.js** - compilation, route compiling
- **ts-node-dev** - restart, compilation complete
- **uvicorn** - file change detection, reloader process
- **Django** - file change watching, system checks
- **Flask** - restart with stat/watchdog, change detection

When `watch_for_errors` detects a hot-reload, it sets `hot_reload_detected: true` in the response so the agent knows the server actually reloaded.

## Security

- All log output is redacted for secrets (16 patterns: API keys, Bearer/JWT tokens, connection strings, PEM keys, GitHub/GitLab/Slack tokens, GCP service accounts, Azure connection strings, Datadog keys) before entering the pipeline
- No secrets in MCP responses, ring buffer, or diagnostic output
- HTTP endpoints bind to `127.0.0.1` only - no external access
- Fingerprint persistence stores only hashes, not raw error messages
- No file system writes except optional fingerprint persistence

## TracePulse for Teams (Coming Soon)

**Local:** Your agent sees your server. **Team:** Every agent sees every server.

Deploy a shared TracePulse instance for your engineering team. Every developer's AI agent connects via HTTPS to one server that:

- **Aggregates errors** across all dev environments
- **Shares fingerprints** - if one developer hits a bug, every agent knows
- **Team audit trail** - see tool usage and token savings across the team
- **Centralized drift detection** - one health check covers shared staging
- **SSO/API key auth** - enterprise-ready access control

```json
{
  "mcpServers": {
    "tracepulse": {
      "type": "streamable-http",
      "url": "https://tracepulse.internal.company.com/mcp",
      "headers": { "Authorization": "Bearer <team-api-key>" }
    }
  }
}
```

Self-hosted via Docker or one-click deploy on Railway/Fly.io. [Roadmap](docs/roadmap/roadmap.md)

## Companion Tools

TracePulse is designed to work alongside:

- **[ViewGraph](https://github.com/sourjya/viewgraph)** - Visual cortex: structured UI perception (DOM, a11y, layout, annotations)
- **[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)** - Motor cortex: browser interaction (console, network, performance)

TracePulse is the auditory cortex - it hears what the backend is saying. Together, the agent has the same situational awareness a senior developer has: see the UI, act in the browser, hear the server.

*The cortex analogy maps to the Perception-Planning-Acting modular architecture formalized in GUI agent research ([arXiv 2412.13501](https://arxiv.org/abs/2412.13501), [arXiv 2504.20464](https://arxiv.org/abs/2504.20464)). ViewGraph provides the perception module, Chrome DevTools MCP the action module, TracePulse the environment feedback module.*

## Architecture

See [docs/architecture/architecture-guide.md](docs/architecture/architecture-guide.md) for the full architecture guide with diagrams.

## License

AGPL-3.0
