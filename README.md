# TracePulse

[![npm version](https://img.shields.io/npm/v/tracepulse)](https://www.npmjs.com/package/tracepulse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-592%20passing-brightgreen)]()

**Runtime feedback MCP server for AI coding agents.**

ViewGraph sees the UI. TracePulse feels the backend.

> "LLMs can't see what happens when their code actually runs. They're throwing darts in the dark." - [Sentry Engineering](https://blog.sentry.io/vibe-coding-closing-the-feedback-loop-with-traceability/)
>
> TracePulse closes this loop at dev time - seconds after the code change, not minutes after deployment.

TracePulse watches your dev server's stdout/stderr, parses errors into structured events with signal scoring, and exposes them as MCP tools that any AI coding agent can call. The agent edits code, calls `get_errors`, and instantly knows if the fix worked - no manual log reading, no copy-paste.

## Status

🟡 **Alpha v0.9.0+ - Phases 1-5 complete.** Core pipeline, watch mode, multi-process support, frontend-backend correlation, proactive monitoring. 20 error parsers, 26 MCP tools, 630 tests passing.

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
| `run_and_watch(command, timeout_seconds?)` | Run tests/linter/typechecker, get parsed results | ~1,000 |
| `get_requests(path?, limit?, status_code_min?)` | Recent HTTP requests filtered by path and status | ~1,000 |
| `get_health_summary()` | One-line health check: errors, warnings, uptime | ~100 |
| `verify_fix(duration_seconds?)` | All-in-one post-fix verification with pass/fail verdict | ~500 |
| `wait_for_build(timeout_seconds?)` | Block until next build completes (event-driven) | ~200 |
| `wait_for_event(type?, timeout_seconds?)` | Block until next error/warning/build/crash event | ~200 |

## Error Parsers

TracePulse parses errors from 18 sources out of the box:

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

**Infrastructure:**
- **HTTP Access Log** - uvicorn, express/morgan, nginx with status and duration
- **Migration** - alembic and Django migration output

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

# Attach to existing log file
tracepulse attach --log-file ./server.log

# Multi-process - monitor multiple services
tracepulse start --service api="npm run dev:api" --service worker="npm run worker"

# Config file
tracepulse start --config tracepulse.config.json

# Docker Compose
tracepulse compose --file docker-compose.yml

# With persistence (saves fingerprints across sessions)
tracepulse start --persist "npm run dev"

# With HTTP transport (for multi-client scenarios)
tracepulse start --http "npm run dev"
```

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

- All log output is redacted for secrets (12 patterns: API keys, Bearer/JWT tokens, connection strings, PEM keys, GitHub/GitLab/Slack tokens) before entering the pipeline
- No secrets in MCP responses, ring buffer, or diagnostic output
- HTTP endpoints bind to `127.0.0.1` only - no external access
- Fingerprint persistence stores only hashes, not raw error messages
- No file system writes except optional fingerprint persistence

## Companion Tools

TracePulse is designed to work alongside:

- **[ViewGraph](https://github.com/sourjya/viewgraph)** - UI context layer (DOM, a11y, layout, annotations)
- **[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)** - Browser debugging (console, network, performance)

Together: backend verification (TracePulse) → browser verification (Chrome DevTools MCP) → visual verification (ViewGraph).

## Architecture

See [docs/architecture/architecture-guide.md](docs/architecture/architecture-guide.md) for the full architecture guide with diagrams.

## License

MIT
