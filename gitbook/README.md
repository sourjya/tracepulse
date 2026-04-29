# The Backend Feedback Layer for AI Coding Agents

**TracePulse - Runtime feedback MCP server.**

[ViewGraph](https://chaoslabz.gitbook.io/viewgraph) sees the UI. TracePulse feels the backend.

> "LLMs can't see what happens when their code actually runs. They're throwing darts in the dark."
> - [Sentry Engineering](https://blog.sentry.io/vibe-coding-closing-the-feedback-loop-with-traceability/)

TracePulse closes this loop at dev time - seconds after the code change, not minutes after deployment.

## How It Works

```mermaid
graph LR
    Dev["Your Dev Server
    (any language)"]
    TP["TracePulse
    MCP Server"]
    Agent["AI Coding Agent
    (Kiro, Cursor, Claude Code)"]

    Dev -->|stdout / stderr| TP
    TP -->|"26 MCP tools
    (JSON-RPC over stdio)"| Agent
    Agent -->|"get_errors()
    verify_fix()
    run_and_watch()"| TP
```

TracePulse watches your dev server's output, parses errors from [20 sources](features/parsers.md) ([Node.js](https://nodejs.org), [Python](https://python.org), [Go](https://go.dev), [Java](https://dev.java), [Rust](https://www.rust-lang.org), [TypeScript](https://www.typescriptlang.org), and more), [scores them by importance](features/signal-scoring.md), and serves them to your AI coding agent through [26 MCP tools](features/mcp-tools.md).

The agent edits code, calls `get_errors()`, and instantly knows if the fix worked.

## The Data Pipeline

```mermaid
graph TD
    A["Raw Log Line"] --> B["ANSI Strip"]
    B --> C["Secret Redaction
    (13 patterns)"]
    C --> D["Hot-Reload Detection
    (11 dev tools)"]
    D --> E["Parser Registry
    (20 parsers)"]
    E --> F["Signal Scoring
    (0-100)"]
    F --> G["Ring Buffer
    (500 events)"]
    G --> H["MCP Tools
    (24 tools)"]
    H --> I["AI Agent"]

    style A fill:#f96,stroke:#333
    style G fill:#6af,stroke:#333
    style I fill:#6f6,stroke:#333
```

## The Three-Layer Debugging Stack

```mermaid
graph TB
    Agent["AI Coding Agent"]

    subgraph "Layer 1: Backend"
        TP["TracePulse
        errors, logs, builds, tests"]
    end

    subgraph "Layer 2: Browser"
        CDT["Chrome DevTools MCP
        console, network, performance"]
    end

    subgraph "Layer 3: Visual UI"
        VG["ViewGraph
        DOM, a11y, layout, annotations"]
    end

    Agent <--> TP
    Agent <--> CDT
    Agent <--> VG

    style TP fill:#ff9966,stroke:#333
    style CDT fill:#66aaff,stroke:#333
    style VG fill:#66ff99,stroke:#333
```

Each tool owns its layer. Together they give the AI agent complete visibility into your application.

## The Communication Model

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant TP as TracePulse
    participant Server as Dev Server

    Agent->>Agent: Edit source file
    Server->>TP: stdout: "TypeError at users.py:42"
    TP->>TP: Parse, score (75/100), store

    Agent->>TP: get_errors()
    TP-->>Agent: {errors: [{file: "users.py", line: 42, score: 75}]}

    Agent->>Agent: Fix the bug

    Agent->>TP: verify_fix(10)
    Server->>TP: stdout: "Server reloaded"
    TP->>TP: Detect hot-reload
    TP-->>Agent: {verdict: "PASS", hot_reload_detected: true}
```

## Quick Links

- [Quick Start (2 minutes) ->](getting-started/quick-start.md)
- [26 MCP Tools ->](features/mcp-tools.md)
- [20 Error Parsers ->](features/parsers.md)
- [How It Works ->](architecture/how-it-works.md)
- [Feature Matrix vs Competitors ->](comparison/feature-matrix.md)

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
