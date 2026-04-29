# Uninstall

## Remove from MCP config

Delete the `tracepulse` entry from your MCP config file:

| Client | Config File |
|--------|-------------|
| Kiro CLI | `.kiro/settings/mcp.json` |
| Cursor | `.cursor/mcp.json` |
| VS Code | `.vscode/mcp.json` |
| Claude Desktop | `claude_desktop_config.json` |

Remove this block:
```json
"tracepulse": {
  "command": "npx",
  "args": ["tracepulse", "start", "npm run dev"]
}
```

## Clean up persistence (optional)

If you used `--persist`, TracePulse stores fingerprint data in your project:

```bash
rm -rf .tracepulse/
```

## Uninstall global package (if installed)

```bash
npm uninstall -g tracepulse
```

## That's it

TracePulse has no browser extension, no background service, and no system-level installation. Removing the MCP config entry is all that's needed.
