# What is TracePulse?

TracePulse is a runtime feedback MCP server for AI coding agents. It watches your dev server's stdout/stderr, parses errors into structured data, scores them by importance, and exposes them as tools the AI agent can call.

*Fewer wasted tokens. Faster shipping. Lower carbon footprint. Responsible AI in action.*

## The Problem

When you're using an AI assistant (Kiro, Claude Code, Cursor, Copilot) to write code, the agent can't see what happens when its code runs. If the dev server crashes or throws an error, the agent has no way to know. You'd have to manually copy-paste error logs into the chat.

This blindness costs more than time. Research shows agents waste [59.4% of their tokens](https://arxiv.org/html/2601.14470v1) re-reading their own work. Every wasted token is wasted compute, wasted energy, and avoidable carbon emissions - at a time when [data center electricity demand is projected to double by 2030](https://www.iea.org/news/ai-is-set-to-drive-surging-electricity-demand-from-data-centres-while-offering-the-potential-to-transform-how-the-energy-sector-works).

## The Solution

TracePulse sits between your dev server and your AI agent:

```
Dev Server -> stdout/stderr -> TracePulse -> MCP Tools -> AI Agent
```

1. **Reads** log output from your dev server
2. **Strips** ANSI color codes
3. **Redacts** secrets (API keys, tokens, passwords)
4. **Parses** errors with 25 framework-specific parsers
5. **Scores** each error 0-100 by importance
6. **Stores** in a ring buffer (500 events max)
7. **Serves** via 30 MCP tools the agent can call

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
