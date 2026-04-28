# TracePulse

**Runtime feedback MCP server for AI coding agents.**

ViewGraph sees the UI. TracePulse feels the backend.

> "LLMs can't see what happens when their code actually runs. They're throwing darts in the dark."
> — Sentry Engineering

TracePulse closes this loop at dev time — seconds after the code change, not minutes after deployment.

## What It Does

TracePulse watches your dev server's output, parses errors from 18 sources (Node.js, Python, Go, Java, Rust, TypeScript, and more), scores them by importance, and serves them to your AI coding agent through MCP tools.

The agent edits code, calls `get_errors()`, and instantly knows if the fix worked.

## Quick Links

- [Quick Start →](getting-started/quick-start.md)
- [18 MCP Tools →](features/mcp-tools.md)
- [How It Works →](architecture/how-it-works.md)
- [Feature Matrix vs Competitors →](comparison/feature-matrix.md)

## The Three-Layer Stack

```
TracePulse (backend) → Chrome DevTools MCP (browser) → ViewGraph (visual UI)
```

Each tool owns its layer. Together they give the AI agent complete visibility into your application.
