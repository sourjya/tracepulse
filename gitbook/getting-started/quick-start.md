# Quick Start

Get TracePulse running in 2 minutes.

## 1. Add to your MCP config

Find your MCP client's config file:

| Client | Config File |
|--------|-------------|
| **Kiro CLI** | `.kiro/settings/mcp.json` |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Cursor** | `.cursor/mcp.json` |
| **VS Code** | `.vscode/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |

Add TracePulse:

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

## 2. Start a chat

Open your AI coding agent. TracePulse starts automatically when the MCP client connects.

## 3. Ask the agent to check for errors

```
Are there any backend errors?
```

The agent calls `get_errors()` and tells you what's wrong - with file, line number, error type, and importance score.

## That's it

The agent now has 18 tools for backend debugging. It will use them automatically when investigating errors, verifying fixes, and monitoring your dev server.

## Next Steps

- [Installation options ->](installation.md)
- [Attach mode (for already-running servers) ->](installation.md#attach-mode)
- [All 18 MCP tools ->](../features/mcp-tools.md)
