# The Backend Feedback Layer for AI Coding Agents

**TracePulse - Runtime feedback MCP server.**

[ViewGraph](https://chaoslabz.gitbook.io/viewgraph) sees the UI. TracePulse feels the backend.

> "LLMs can't see what happens when their code actually runs. They're throwing darts in the dark."
> - [Sentry Engineering](https://blog.sentry.io/vibe-coding-closing-the-feedback-loop-with-traceability/)

TracePulse closes this loop at dev time - seconds after the code change, not minutes after deployment.

[![npm](https://img.shields.io/npm/v/tracepulse)](https://www.npmjs.com/package/tracepulse) [![GitHub](https://img.shields.io/github/stars/sourjya/tracepulse)](https://github.com/sourjya/tracepulse)

---

## The Problem

**AI coding agents can write code. They cannot see what happens when it runs.**

- The agent edits a file but **can't tell if the server crashed**
- Errors pile up in terminal logs that the agent **never reads**
- Build failures are invisible until the developer **manually checks**
- The agent iterates blindly, **compounding errors** on top of errors
- Debugging requires **copy-pasting logs** into the chat

These problems cost 15-30 minutes per debugging session. TracePulse eliminates them.

---

## How It Works

```
Your Dev Server                TracePulse                    AI Agent
(any language)                 MCP Server                    (any MCP client)
      |                             |                             |
      |--- stdout/stderr --------->|                             |
      |                             |-- parse (20 parsers) ----->|
      |                             |-- score (0-100) ---------->|
      |                             |-- deduplicate ------------>|
      |                             |-- redact secrets --------->|
      |                             |                             |
      |                             |<--- get_errors() ----------|
      |                             |---- file:line, score ----->|
      |                             |                             |
      |                             |<--- verify_fix(10) --------|
      |                             |---- PASS / FAIL ---------->|
```

---

## Your Agent Is Wasting Tokens on Log Reading

Research shows AI agents spend **60-80% of their token budget** on orientation and retrieval, not problem-solving. One study found an agent reading 25 files to answer a question that needed 3.

```
Tokens per backend error investigation:

Manual log reading    ████████████████████████████████████  12,000+
Shell + grep + parse  ██████████████████████████████        10,000
TracePulse get_errors ██                                     1,000
TracePulse verify_fix █                                        500
```

TracePulse pre-parses, scores, and deduplicates. The agent gets the exact file:line in one call instead of scanning raw logs.

**That's 12,000 tokens down to 1,000. Per error. Per session.**

---

## The Three-Layer Debugging Stack

```
Layer 1: Backend          Layer 2: Browser           Layer 3: Visual UI
+------------------+     +--------------------+     +------------------+
|   TracePulse     |     | Chrome DevTools MCP|     |    ViewGraph     |
|                  |     |                    |     |                  |
| Server errors    |     | Console messages   |     | DOM structure    |
| Build failures   |     | Network requests   |     | Accessibility    |
| Test results     |     | Performance traces |     | Layout analysis  |
| Infrastructure   |     | Screenshots        |     | Annotations      |
+------------------+     +--------------------+     +------------------+
        |                         |                         |
        +------------+------------+-------------------------+
                     |
              AI Coding Agent
         (Kiro, Cursor, Claude Code)
```

Each tool owns its layer. Together they give the agent complete visibility.

---

## What Makes It Different

```
                          TracePulse    Sentry MCP    Chrome DevTools    BrowserTools
                          ----------   ----------    ---------------    ------------
Backend error parsing     Yes (20)     Yes (prod)    No                 No
Signal scoring (0-100)    Yes          No            No                 No
Fingerprint dedup         Yes          No            No                 No
Hot-reload detection      Yes (11)     No            No                 No
Dev-time (seconds)        Yes          No (minutes)  Yes                Yes
Works without browser     Yes          Yes           No                 No
Test runner integration   Yes          No            No                 No
Infrastructure discovery  Yes          No            No                 No
Agent skill files         Yes (10)     No            No                 No
Zero config               Yes          No            Yes                No (extension)
```

---

## 26 MCP Tools

```
Quick checks:           get_project_health, get_health_summary, get_runtime_status
Error detection:        get_errors, get_new_errors, get_build_errors, get_requests
Deep investigation:     get_error_context, get_error_trends, get_timeline, get_server_logs
Watch & verify:         verify_fix, watch_for_errors, wait_for_build, wait_for_event
Execute & parse:        run_and_watch (tests, linters, type checkers)
Infrastructure:         get_infra_status, get_infra_detail, check_port
Correlation:            get_correlated_errors, correlate_with_diff
Management:             clear_errors, list_services, restart_server
Probes:                 register_probe, list_probes
```

---

## 20 Error Parsers

```
Runtime:        Node.js, Python, Go, Java, Rust, JSON logs, Structlog
Build:          TypeScript, ESLint, Vite/webpack, Build stats
Test:           pytest, Jest, vitest, Go test
Infrastructure: HTTP access logs, Migrations, npm audit, Coverage
```

---

## Real-World Results

From 3 agent sessions on a production project:

```
Metric                              Value
------                              -----
Total tool invocations              70+
Most used tool                      get_build_errors (23x)
Manual vite builds replaced         15+
Time saved (build checks)           20+ minutes
Real bugs caught                    3 (500 error, migration error, transient crash)
Feature request to bug catch        Same day (message_contains -> caught 500)
Agent wishlist items shipped         21/22 (95%)
```

---

## Install

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

Works with [Kiro](getting-started/mcp-client-setup.md), [Cursor](getting-started/mcp-client-setup.md), [Claude Desktop](getting-started/mcp-client-setup.md), [VS Code](getting-started/mcp-client-setup.md), [Windsurf](getting-started/mcp-client-setup.md), and any MCP-compatible agent.

---

## Open Source

AGPL-3.0 licensed. Full source on [GitHub](https://github.com/sourjya/tracepulse).

| Resource | Link |
|----------|------|
| npm | [npmjs.com/package/tracepulse](https://www.npmjs.com/package/tracepulse) |
| GitHub | [github.com/sourjya/tracepulse](https://github.com/sourjya/tracepulse) |
| Docs | [chaoslabz.gitbook.io/tracepulse](https://chaoslabz.gitbook.io/tracepulse) |

---

## Quick Links

- [Quick Start (2 minutes) ->](getting-started/quick-start.md)
- [26 MCP Tools ->](features/mcp-tools.md)
- [20 Error Parsers ->](features/parsers.md)
- [How It Works ->](architecture/how-it-works.md)
- [Feature Matrix vs Competitors ->](comparison/feature-matrix.md)
- [The Three-Layer Stack ->](architecture/three-layer-stack.md)
