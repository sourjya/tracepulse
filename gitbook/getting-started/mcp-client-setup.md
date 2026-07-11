# MCP Client Setup

Step-by-step setup for each AI coding tool. The config is the same everywhere - only the file location changes.

## The config (same for all tools)

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse"
    }
  }
}
```

If you also want live server monitoring, add your dev server command:

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

Replace `npm run dev` with your server command. See [Quick Start](quick-start.md#optional-monitor-your-dev-server) for examples by language.

---

## Kiro CLI

**Config file:** `.kiro/settings/mcp.json` in your project folder.

Create the file if it doesn't exist:
```bash
mkdir -p .kiro/settings
```

Paste the config above and restart Kiro. Verify with `/mcp list`.

{% hint style="warning" %}
The file is `.kiro/settings/mcp.json` - not `.kiro/mcp.json`. This is the most common setup mistake.
{% endhint %}

## Cursor

**Config file:** `.cursor/mcp.json` in your project folder.

Paste the config and restart Cursor.

## Claude Code (CLI)

**Config file:** `~/.claude.json` (user home directory)

Claude Code stores MCP servers per-project inside `~/.claude.json`. The structure is different from other tools:

```json
{
  "projects": {
    "/absolute/path/to/your/project": {
      "mcpServers": {
        "tracepulse": {
          "command": "tracepulse",
          "args": ["standalone"]
        }
      }
    }
  }
}
```

Use `standalone` for library projects. Use `start "your command"` for projects with a dev server.

{% hint style="warning" %}
**Common mistake:** Don't put MCP servers in `.claude/settings.json` (project permissions file) or `~/.claude/settings.json` (user preferences). They go in `~/.claude.json` only. Run `/mcp` in Claude Code to verify which file it reads.
{% endhint %}

## Claude Desktop

**Config file location:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Open the file, add the TracePulse entry inside the `mcpServers` object, and restart Claude Desktop.

## VS Code (GitHub Copilot)

**Config file:** `.vscode/mcp.json` in your project folder.

Paste the config and reload the VS Code window.

## Windsurf

**Config file:** `~/.codeium/windsurf/mcp_config.json`

Paste the config and restart Windsurf.

## Generic (.mcp.json)

For any MCP client that reads `.mcp.json` from the project root, create the file and paste the config.

---

## Verifying it works

After adding the config and restarting your tool:

1. **Kiro CLI:** Type `/mcp list` - TracePulse should show `● running 44 tools`
2. **Other tools:** Ask the agent "What TracePulse tools are available?" - it should list the tools
3. **Quick test:** Ask "Check project health" - the agent should call `get_project_health` and report your project status

If it's not working, see [Troubleshooting](installation.md#troubleshooting).
