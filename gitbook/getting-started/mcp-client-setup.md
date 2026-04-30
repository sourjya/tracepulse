# MCP Client Setup

Detailed setup instructions for each AI coding tool.

## Kiro CLI

Config file: `.kiro/settings/mcp.json` (in your project root)

> WARNING: **Common mistake:** Kiro uses `.kiro/settings/mcp.json`, not `.kiro/mcp.json`.

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

## Claude Desktop

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

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

## Cursor

Config file: `.cursor/mcp.json` (in your project root)

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

## VS Code (GitHub Copilot)

Config file: `.vscode/mcp.json` (in your project root)

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

## Windsurf

Config file: `~/.codeium/windsurf/mcp_config.json`

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

## Generic (.mcp.json)

For any MCP client that reads `.mcp.json` from the project root:

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

## Verifying the Connection

After adding the config, start a new chat session. Ask the agent:

```
What TracePulse tools are available?
```

It should list 24 tools. If tools don't appear, check:
1. Config file is in the correct location
2. Node.js >= 22 is installed
3. `npx tracepulse --version` works from your terminal
