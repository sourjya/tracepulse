# M21: Zero-Config Capability Architecture

## Problem Statement

TracePulse's current startup model assumes a running dev server. This creates a cascade of failures for the most common real-world scenarios:

1. **Fresh project** - no server, no deps, maybe no package.json. `tracepulse start "npm run dev"` fails immediately.
2. **Python project** - needs PYTHONPATH, venv activation, or a start script. Users write `PYTHONPATH=src python -m app` which fails silently (spawn != shell).
3. **Library/monorepo** - no single dev server. Standalone mode works but feels like a fallback, not a first-class experience.
4. **First-time user** - has to choose between start/attach/standalone/compose before understanding what TracePulse does. Wrong choice = broken first impression.

The "connection closed: initialize response" error in Kiro's MCP panel is the #1 abandonment point. We've seen it on 3 different projects in real testing.

## Design Principle

**TracePulse should never fail to start.** It should always connect, always provide tools, and progressively activate capabilities as the project reveals itself.

## Architecture: Capability Layers

```
Layer 0: Filesystem (always available, zero deps)
  Activates: immediately on startup
  Detects: nothing needed - just a working directory
  
Layer 1: Project Intelligence (file detection)
  Activates: on startup, reads files in cwd
  Detects: package.json, pyproject.toml, go.mod, Cargo.toml, pom.xml, .env
  
Layer 2: Live Monitoring (process or log stream)
  Activates: when agent calls start_server() or user provides command
  Detects: stdout/stderr from a running process
  
Layer 3: Cross-Session Intelligence (persistence)
  Activates: when .tracepulse/ directory has history
  Detects: fingerprint files, session history
```

### Layer 0: Filesystem Tools (always available)

These tools work with just a filesystem. No server, no deps, no config.

| Tool | What it does |
|------|-------------|
| `run_and_watch` | Run any command, get parsed results |
| `check_port` | Check if a port is available |
| `check_drift` | Env vars, deps, migrations drift |
| `get_migration_status` | Check/run pending migrations |
| `verify_build` | Typecheck + build in one call |
| `get_project_health` | Composite health (adapts to what's available) |
| `get_session_summary` | Session manifest |
| `get_session_insights` | Agent effectiveness |
| `get_session_impact` | Environmental report |
| `get_audit_trail` | Tool usage review |

**Pitfall: "Why can't I see errors?"**
Agent calls `get_errors` on Layer 0 and gets nothing. It doesn't know there's no server running.
**Mitigation:** `get_errors` on Layer 0 returns: `{ errors: [], hint: "No server monitored. Call start_server('your command') to begin monitoring, or use run_and_watch to run commands." }`

**Pitfall: run_and_watch allowlist too narrow**
Already hit this - agent tries `python -m pytest`, gets rejected.
**Mitigation:** Already fixed (expanded allowlist). But also: Layer 1 detection should auto-expand the allowlist based on detected stack. Python project -> allow `python`, `.venv/bin/*`. Go project -> allow `go test`, `go run`.

### Layer 1: Project Intelligence (file detection)

On startup, scan cwd for project markers. Register stack-specific tools and set defaults.

| File detected | Stack | Tools activated | Defaults set |
|--------------|-------|-----------------|-------------|
| `package.json` | Node.js | `get_build_errors` (tsc/eslint/vite) | run_and_watch allows npx, npm, pnpm, bun |
| `pyproject.toml` or `requirements.txt` | Python | pytest parser priority | run_and_watch allows python, .venv/bin/*, uv |
| `go.mod` | Go | go test/panic parsers priority | run_and_watch allows go |
| `Cargo.toml` | Rust | cargo test/panic parsers priority | run_and_watch allows cargo |
| `pom.xml` or `build.gradle` | Java | JUnit/Maven/Gradle parsers priority | run_and_watch allows mvn, gradle |
| `.env` | Any | `get_infra_status`, `get_infra_detail` | Infra monitor starts probing |
| `docker-compose.yml` | Any | Suggest compose mode | - |
| `.tracepulse/` | Any | Layer 3 tools | Load history |

**Pitfall: Wrong stack detection in monorepos**
Root has package.json but the user is working in a Python subdirectory.
**Mitigation:** Detect ALL markers, not just the first. Report detected stacks in `get_project_health`: `"stacks_detected": ["node", "python"]`. Let the agent use `cwd` parameter to target subdirectories.

**Pitfall: Scanning too many files on startup**
Large monorepos with thousands of files.
**Mitigation:** Only scan root and one level deep. Check for specific filenames, don't glob. Should take <10ms.

**Pitfall: False positives**
A `package.json` in a Python project (for frontend tooling) triggers Node.js detection.
**Mitigation:** This is actually correct - the project HAS Node.js tooling. Detecting multiple stacks is a feature, not a bug. Report all detected stacks.

### Layer 2: Live Monitoring (the current "start" mode)

Instead of requiring the server command at startup, provide a `start_server` tool the agent can call mid-session:

```
start_server(command: "npm run dev")
start_server(command: "python manage.py runserver", env: { "PYTHONPATH": "src" })
start_server(command: "bash scripts/start.sh")
```

This activates:
| Tool | What it does |
|------|-------------|
| `get_errors` | Errors from the live stream |
| `watch_for_errors` | Block and collect after code change |
| `verify_fix` | Post-fix verification |
| `get_build_errors` | Build/compile errors |
| `get_server_logs` | All log events |
| `get_timeline` | Chronological event stream |
| `get_error_context` | Deep-dive into specific error |
| `get_correlated_errors` | Frontend-backend correlation |
| `list_services` | Multi-service status |
| `restart_server` | Kill and respawn |
| `wait_for_build` | Block until HMR completes |
| `wait_for_event` | Block until specific event |
| `get_requests` | HTTP access log requests |
| `get_perf_baseline` | Response time percentiles |

**Pitfall: Agent doesn't know to call start_server**
Agent has Layer 0/1 tools but doesn't realize it should start a server.
**Mitigation:** `get_project_health` detects runnable projects and suggests: `"server": { "status": "not_started", "suggestion": "Detected npm dev script. Call start_server('npm run dev') to begin monitoring." }`. Also detect common start scripts and suggest them.

**Pitfall: start_server called with wrong command**
Same env var / shell syntax issues as today.
**Mitigation:** The startup diagnostics module we just built runs on the command BEFORE spawning. If it detects shell syntax, return the fix immediately instead of failing and falling back.

**Pitfall: start_server called twice**
Agent calls start_server again while a server is already running.
**Mitigation:** Return error: `"Server already running on PID 12345. Call restart_server() to restart, or stop_server() first."`

**Pitfall: Server starts but crashes immediately**
Command is valid but the app has a startup error (missing DB, wrong port, import error).
**Mitigation:** Capture the first 5 seconds of output, parse it, and return structured errors: `{ "started": false, "startup_errors": [...], "diagnostics": [...] }`. The agent gets the error immediately, not after a timeout.

**Pitfall: MCP protocol timing**
If start_server takes 10 seconds (installing deps, compiling), the MCP client might time out.
**Mitigation:** start_server returns immediately with `{ "status": "starting", "pid": 12345 }`. The agent polls with `get_project_health` or uses `wait_for_event(type: "build")` to know when it's ready.

### Layer 3: Cross-Session Intelligence

Activates automatically when `.tracepulse/` has data. No user action needed.

| Tool | What it does |
|------|-------------|
| `get_bug_patterns` | Recurring, flaky, velocity patterns |
| `get_new_errors` | Only unseen fingerprints |
| `get_error_trends` | Per-fingerprint history |
| `acknowledge_error` | Mark as investigated |

**Pitfall: First session has no history**
`get_bug_patterns` returns empty, `get_new_errors` treats everything as new.
**Mitigation:** Already handled - these tools return meaningful empty states. `get_new_errors` without history returns all errors (everything is "new"). `get_bug_patterns` returns `"No patterns detected (need 3+ sessions)."`.

## New CLI Interface

### Default: zero-config
```bash
tracepulse
```
Starts Layer 0 + Layer 1 (auto-detect). Agent calls `start_server()` when ready.

### Explicit server (backward compatible)
```bash
tracepulse start "npm run dev"
```
Starts Layer 0 + 1 + 2 immediately. Same as today.

### MCP config (simplest possible)
```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse"
    }
  }
}
```
Works for ANY project. Node, Python, Go, Rust, Java, fresh, library, monorepo.

### MCP config with server (for users who know their command)
```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse",
      "args": ["start", "npm run dev"]
    }
  }
}
```
Same as today. Backward compatible.

## New Tool: start_server

```typescript
start_server({
  command: "npm run dev",           // Required
  env?: { PYTHONPATH: "src" },      // Optional env vars
  cwd?: "./backend",                // Optional working directory
  name?: "api",                     // Optional service name (for multi-service)
})
```

Returns immediately:
```json
{
  "status": "starting",
  "pid": 12345,
  "command": "npm run dev",
  "hint": "Call get_project_health() or wait_for_event('build') to check when ready."
}
```

Or on validation failure (before spawning):
```json
{
  "status": "invalid",
  "diagnostics": [
    { "issue": "PYTHONPATH=src is shell syntax", "fix": "Pass env: { PYTHONPATH: 'src' }" }
  ]
}
```

**Pitfall: Security - arbitrary command execution**
start_server accepts any command. Same risk as run_and_watch.
**Mitigation:** Same allowlist as run_and_watch. Reject shell metacharacters. The agent can only start known dev server commands, not arbitrary shell scripts... actually, `bash scripts/start.sh` needs to work. The allowlist already includes `bash`. The metacharacter check prevents injection within the command. This is acceptable - the user configured TracePulse in their MCP config, so they've already trusted it with process execution.

## New Tool: stop_server

```typescript
stop_server({ name?: "api" })  // Stop specific service, or the main one
```

Sends SIGTERM, waits 5s, SIGKILL if needed. Returns confirmation.

## get_project_health Adaptation

Layer-aware response:

**Layer 0 (no server):**
```json
{
  "healthy": true,
  "layers": { "filesystem": true, "project": true, "server": false, "history": false },
  "stacks_detected": ["python", "node"],
  "server": {
    "status": "not_started",
    "suggestions": [
      "Detected pyproject.toml with [tool.uvicorn]. Try: start_server('uvicorn main:app --reload')",
      "Detected package.json with 'dev' script. Try: start_server('npm run dev')"
    ]
  },
  "tools_available": 12,
  "tools_pending": 15,
  "hint": "12 tools available now. Start a server to unlock 15 more."
}
```

**Layer 2 (server running):**
```json
{
  "healthy": true,
  "layers": { "filesystem": true, "project": true, "server": true, "history": true },
  "server": { "status": "running", "pid": 12345, "uptime_minutes": 42 },
  "errors": { "runtime": 0, "build": 0 },
  "tools_available": 37
}
```

## Migration Path

### Phase 1: Zero-config default (2-3 days)
- Make `tracepulse` (no args) start in Layer 0+1 mode
- Keep `tracepulse start "cmd"` working exactly as today
- Add `start_server` tool that activates Layer 2 mid-session
- Update `get_project_health` with layer-aware response and server suggestions

### Phase 2: Smart detection (1 week)
- Scan project files for start command hints:
  - `package.json` scripts.dev -> suggest `npm run dev`
  - `pyproject.toml` [tool.uvicorn] -> suggest `uvicorn main:app`
  - `Makefile` with `dev:` target -> suggest `make dev`
  - `docker-compose.yml` -> suggest compose mode
  - `scripts/start.sh` or `scripts/dev.sh` -> suggest `bash scripts/start.sh`
- Pre-validate commands before spawning (run diagnostics)
- Auto-expand run_and_watch allowlist based on detected stack

### Phase 3: Dynamic tool registration (1 week)
- Only register Layer 2 tools after start_server succeeds
- Only register Layer 3 tools after history loads
- Agent sees exactly the tools that work right now
- MCP `tools/list_changed` notification when new tools activate

### Phase 4: Multi-server (1 week)
- `start_server` can be called multiple times with different names
- Each server gets its own collector, tagged by name
- `stop_server(name)` stops a specific one
- Replaces the current `--service` flag approach

## Risks and Open Questions

### R1: MCP clients may not handle dynamic tool registration
Some MCP clients cache the tool list at connection time and never refresh.
**Mitigation:** Phase 3 uses `tools/list_changed` notification (MCP spec supports this). For clients that don't support it, all tools are registered at startup but Layer 2/3 tools return helpful "not yet available" messages with instructions.

### R2: start_server is a new tool agents need to learn
Agents trained on the current docs won't know to call start_server.
**Mitigation:** get_project_health suggests it. SKILL.md documents it. The tool description says "Start a dev server for live error monitoring." Agents discover tools by description.

### R3: Backward compatibility
Existing users have `tracepulse start "npm run dev"` in their configs.
**Mitigation:** 100% backward compatible. `start` subcommand still works. The change is that `tracepulse` with no args now works too (instead of printing help and exiting).

### R4: Security of start_server
Agent can start arbitrary processes.
**Mitigation:** Same allowlist as run_and_watch. User already trusts TracePulse with process execution by installing it. start_server is no more dangerous than run_and_watch.

### R5: Multiple agents calling start_server
In team/multi-client scenarios, two agents might try to start the same server.
**Mitigation:** Second call returns "Server already running." Port conflict detection via check_port before spawning.

## Success Metrics

1. **Zero startup failures** - TracePulse always connects, always provides tools
2. **Time to first useful tool call** - should be <5 seconds for any project type
3. **No mode selection required** - user never has to choose start/attach/standalone/compose
4. **Self-documenting** - get_project_health tells the agent what to do next

## Out of Scope

- Auto-starting servers without agent/user action (too magical, security risk)
- Auto-detecting the correct start command and running it (suggest only, don't execute)
- Replacing docker-compose mode (compose stays as-is for Docker projects)
- Hot-swapping between servers mid-session (stop + start is fine)
