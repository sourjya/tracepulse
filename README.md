# TracePulse

**Runtime feedback MCP server for AI coding agents.**

ViewGraph sees the UI. TracePulse feels the backend.

TracePulse watches your dev server's stdout/stderr, parses errors into structured events with signal scoring, and exposes them as MCP tools that any AI coding agent can call. The agent edits code, calls `watch_for_errors(15)`, and instantly knows if the fix worked — no manual log reading, no copy-paste.

## Status

🚧 **Pre-alpha** — Architecture and spec phase. Not yet functional.

## The Problem

AI coding agents are blind to what happens after code runs. When a dev server crashes, the developer manually reads logs, copies the error, and pastes it into the agent. This manual loop is the #1 bottleneck in agentic development.

## The Solution

```
Dev server stdout/stderr → Secret Redaction → Error Parsing → Signal Scoring → Ring Buffer → MCP Tools → Agent
```

TracePulse sits between your dev server and your AI agent, turning raw log output into structured, scored runtime events.

## Quick Start (Coming Soon)

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

## Companion Tools

TracePulse is designed to work alongside:

- **[ViewGraph](https://github.com/sourjya/viewgraph)** — UI context layer (DOM, a11y, layout, annotations)
- **[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)** — Browser debugging (console, network, performance)

Together: backend verification (TracePulse) → browser verification (Chrome DevTools MCP) → visual verification (ViewGraph).

## License

MIT
