# What is TracePulse?

TracePulse is a runtime feedback MCP server for AI coding agents. It watches your dev server's stdout/stderr, parses errors into structured data, scores them by importance, and exposes them as tools the AI agent can call.

## The Problem

When you're using an AI assistant (Kiro, Claude Code, Cursor, Copilot) to write code, the agent can't see what happens when its code runs. If the dev server crashes or throws an error, the agent has no way to know. You'd have to manually copy-paste error logs into the chat.

## The Solution

TracePulse sits between your dev server and your AI agent:

```
Dev Server → stdout/stderr → TracePulse → MCP Tools → AI Agent
```

1. **Reads** log output from your dev server
2. **Strips** ANSI color codes
3. **Redacts** secrets (API keys, tokens, passwords)
4. **Parses** errors with 18 framework-specific parsers
5. **Scores** each error 0-100 by importance
6. **Stores** in a ring buffer (500 events max)
7. **Serves** via 18 MCP tools the agent can call

## Two Modes

**Start mode** - TracePulse spawns your dev server:
```bash
tracepulse start "npm run dev"
```

**Attach mode** - TracePulse tails an existing log file:
```bash
tracepulse attach --log-file ./logs/server.log
```

Use attach mode when your servers are already running (Docker, tmux, process managers, scripts).

## What Languages?

Any language that prints to stdout/stderr. TracePulse has dedicated parsers for:

- **Runtime:** Node.js, Python, Go, Java, Rust, JSON structured logs, Structlog
- **Build:** TypeScript compiler, ESLint, Vite/webpack
- **Test:** pytest, Jest, vitest, Go test
- **Infrastructure:** HTTP access logs, database migrations

Lines that don't match any parser are stored as raw info-level events.

## What Agents?

Any MCP-compatible agent: Kiro, Claude Code, Cursor, VS Code Copilot, Windsurf, Cline, and more.
