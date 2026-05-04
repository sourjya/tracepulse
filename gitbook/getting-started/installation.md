# Installation

## Quickest start (any project)

Install once:
```bash
npm install -g tracepulse
```

Add to your MCP config:
```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse"
    }
  }
}
```

That's it. TracePulse auto-detects your project type and provides 39 tools immediately. No server command needed - the agent calls `start_server()` when ready.

{% hint style="info" %}
**Don't have Node.js?** TracePulse requires Node.js 22+ to run, but your project doesn't need to be Node.js. Install Node from [nodejs.org](https://nodejs.org/) (LTS recommended), then `npm install -g tracepulse`.
{% endhint %}

## Config file locations

| MCP Client | Config File |
|------------|-------------|
| **Kiro CLI** | `.kiro/settings/mcp.json` (in your project) |
| **Claude Desktop (macOS)** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Claude Desktop (Windows)** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Cursor** | `.cursor/mcp.json` (in your project) |
| **VS Code (Copilot)** | `.vscode/mcp.json` (in your project) |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Generic** | `.mcp.json` (in your project root) |

## With a dev server command

If you know your server command, pass it directly for immediate monitoring:

**Node.js:**
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

**Python:**
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

**Python with environment variables:**
```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse",
      "args": ["start", "python -m myapp.server"],
      "env": { "PYTHONPATH": "src" }
    }
  }
}
```

**Start script (bash):**
```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse",
      "args": ["start", "bash scripts/start.sh"]
    }
  }
}
```

**Go / Rust / Java:**
```json
{ "args": ["start", "go run main.go"] }
{ "args": ["start", "cargo run"] }
{ "args": ["start", "mvn spring-boot:run"] }
```

{% hint style="warning" %}
**Don't use `VAR=value command` syntax** in args. TracePulse spawns processes directly, not through a shell. Use the `env` field for environment variables, or wrap in `bash -c '...'`.
{% endhint %}

## Other modes

### Attach - tail existing logs

For servers managed by Docker, tmux, pm2, or scripts:
```json
{ "args": ["attach", "--log-file", "./logs/server.log"] }
```

### Multi-service

```json
{ "args": ["start", "--service", "api=npm run dev:api", "--service", "worker=npm run worker"] }
```

### Docker Compose

```json
{ "args": ["compose", "--file", "docker-compose.yml"] }
```

## npx (alternative for Node.js projects)

If you don't want a global install and your project has Node.js:
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

## Troubleshooting

### "connection closed: initialize response"

The MCP client couldn't complete the handshake. Common causes:

1. **Old version** - update: `npm install -g tracepulse@latest`
2. **Dev server command fails** - test it manually in your terminal first
3. **Shell syntax in args** - `PYTHONPATH=src python app.py` doesn't work. Use the `env` field.
4. **Missing dependencies** - TracePulse falls back to standalone mode and prints diagnostics explaining what's wrong

### "tracepulse: command not found"

```bash
npm install -g tracepulse
```

If it still fails, check your PATH includes npm's global bin directory:
```bash
npm config get prefix
# Add <prefix>/bin to your PATH
```

### Tools don't appear in the agent

1. Check you're editing the right config file (Kiro uses `.kiro/settings/mcp.json`, not `.kiro/mcp.json`)
2. Restart the agent/IDE after editing the config
3. Check `/mcp list` in Kiro CLI to see server status

### Server starts but no errors captured

TracePulse only captures stdout/stderr from the spawned process. If your server logs to a file instead, use attach mode:
```json
{ "args": ["attach", "--log-file", "./logs/server.log"] }
```

## Requirements

- Node.js >= 22.0.0
- Any MCP-compatible AI coding agent (Kiro, Claude Code, Cursor, Copilot, Windsurf, Cline)
