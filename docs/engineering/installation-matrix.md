# TracePulse Installation Matrix

Master source of truth for all installation pathways. Update this when new edge cases are discovered.

Last updated: 2026-05-01

## Decision Matrix

| Project Type | Has Node.js on PATH? | Recommended Config | Notes |
|---|---|---|---|
| **Node.js/TS** (has package.json) | Yes | `"command": "npx"` | Zero install, npx downloads on demand |
| **Node.js monorepo** (Turbo/Nx) | Yes | `"command": "npx"` | Same as above, use `cwd` for sub-packages |
| **Python** (has pyproject.toml) | Yes (nvm/system) | `"command": "tracepulse"` (global) | `npm install -g tracepulse` first |
| **Python** (has pyproject.toml) | No | `"command": "/absolute/path/to/tracepulse"` | Find path: `which tracepulse` |
| **Go** (has go.mod) | Yes | `"command": "tracepulse"` (global) | Global install recommended |
| **Java** (has pom.xml) | Yes | `"command": "tracepulse"` (global) | Global install recommended |
| **Rust** (has Cargo.toml) | Yes | `"command": "tracepulse"` (global) | Global install recommended |
| **Fresh project** (no server) | Any | standalone mode | `"args": ["standalone"]` |
| **Docker/tmux managed** | Any | attach mode | `"args": ["attach", "--log-file", "./logs/app.log"]` |
| **WSL** | Varies | Use absolute path | WSL PATH may differ from terminal |
| **Kiro IDE** (not CLI) | Varies | Use absolute path if `tracepulse` not found | IDE may have different PATH than shell |

## Known Edge Cases

### 1. Kiro IDE PATH differs from terminal
**Symptom:** `tracepulse` works in terminal but MCP shows "connection closed: initialize response"
**Cause:** Two possible issues: (a) Kiro IDE doesn't inherit the full shell PATH, or (b) the npm global symlink wrapper doesn't pipe stdin/stdout correctly for MCP
**Fix:** Use `node` with the direct path to cli.js:
```bash
# Find the path:
echo "$(npm prefix -g)/lib/node_modules/tracepulse/dist/cli.js"
```
```json
{ "command": "node", "args": ["/usr/local/sf/lib/node_modules/tracepulse/dist/cli.js", "standalone"] }
```
This bypasses both the PATH issue and the shell wrapper issue.

### 2. npx fails in non-Node projects
**Symptom:** "connection closed: initialize response" with `"command": "npx"`
**Cause:** npx needs Node.js on PATH. Python/Go/Rust projects may not have it.
**Fix:** Global install + `"command": "tracepulse"` or absolute path

### 3. Python venv not activated
**Symptom:** `run_and_watch("pytest")` returns exit 127 (command not found)
**Cause:** System Python doesn't have pytest. Venv not activated.
**Fix:** Use `.venv/bin/pytest` directly: `run_and_watch(".venv/bin/pytest tests/")`

### 4. Standalone mode not in published version
**Symptom:** "connection closed" with `"args": ["standalone"]`
**Cause:** Older npm version doesn't have standalone mode
**Fix:** `npm install -g tracepulse@latest` to get latest version

### 5. Global install not on Kiro's PATH
**Symptom:** `"command": "tracepulse"` fails but works in terminal
**Cause:** npm global bin dir not in Kiro's PATH
**Fix:** Find absolute path:
```bash
echo "$(npm prefix -g)/bin/tracepulse"
```
Use that full path in your MCP config. This works regardless of where npm installs global packages (nvm, system, custom prefix).

## Recommended Setup by Platform

### macOS
```bash
# Install Node.js (if not installed)
brew install node

# Install TracePulse globally
npm install -g tracepulse

# Find the path (for Kiro IDE)
which tracepulse
# Usually: /usr/local/bin/tracepulse or ~/.nvm/versions/node/v22.x/bin/tracepulse
```

### Linux / WSL
```bash
# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 22

# Install TracePulse globally
npm install -g tracepulse

# Find the path (for Kiro IDE)
which tracepulse
# Usually: ~/.nvm/versions/node/v22.x.x/bin/tracepulse or /usr/local/sf/bin/tracepulse
```

### Windows
```powershell
# Install Node.js from nodejs.org
# Install TracePulse globally
npm install -g tracepulse

# Find the path
where tracepulse
# Usually: %APPDATA%\npm\tracepulse.cmd
```

## Config Templates

### Node.js project (npx)
```json
{ "command": "npx", "args": ["tracepulse", "start", "npm run dev"] }
```

### Non-Node project (global, PATH works)
```json
{ "command": "tracepulse", "args": ["start", "python manage.py runserver"] }
```

### Non-Node project (global, reliable - use node directly)
```json
{ "command": "node", "args": ["/usr/local/sf/lib/node_modules/tracepulse/dist/cli.js", "standalone"] }
```
Find your path: `echo "$(npm prefix -g)/lib/node_modules/tracepulse/dist/cli.js"`

### Non-Node project (global, absolute path)
```json
{ "command": "/home/user/.nvm/versions/node/v22.16.0/bin/tracepulse", "args": ["standalone"] }
```

### Standalone (fresh project)
```json
{ "command": "tracepulse", "args": ["standalone"] }
```

### Attach (Docker/tmux)
```json
{ "command": "tracepulse", "args": ["attach", "--log-file", "./logs/server.log"] }
```

## Troubleshooting Flowchart

```
MCP shows "connection closed: initialize response"
  |
  ├── Does `tracepulse --version` work in terminal?
  |     ├── No -> Install: npm install -g tracepulse
  |     └── Yes -> Kiro can't find it
  |           ├── Run: echo "$(npm prefix -g)/bin/tracepulse"
  |           └── Use that absolute path in config
  |
  ├── Does `tracepulse standalone` work in terminal?
  |     ├── No -> Update: npm install -g tracepulse@latest
  |     └── Yes -> PATH issue (see edge case #1)
  |
  └── Is this a non-Node project using npx?
        └── Yes -> Switch to global install (see decision matrix)
```
