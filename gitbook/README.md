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

```mermaid
graph LR
    subgraph Your Machine
        Server["Dev Server\n(Node, Python, Go,\nJava, Rust)"]
        TP["TracePulse\nMCP Server"]
        Agent["AI Coding Agent\n(Kiro, Cursor,\nClaude Code)"]
    end

    Server -->|"stdout\nstderr"| TP
    TP -->|"26 MCP tools\n(JSON-RPC)"| Agent
    Agent -->|"get_errors()\nverify_fix()\nrun_and_watch()"| TP

    style Server fill:#ff9966,stroke:#333,color:#000
    style TP fill:#6699ff,stroke:#333,color:#fff
    style Agent fill:#66cc66,stroke:#333,color:#000
```

---

## Your Agent Is Wasting Tokens on Log Reading

Research shows AI agents spend **60-80% of their token budget** on orientation and retrieval, not problem-solving. One study found an agent reading 25 files to answer a question that needed 3.

```mermaid
xychart-beta
    title "Tokens per backend error investigation"
    x-axis ["Manual\nlog reading", "Shell +\ngrep + parse", "TracePulse\nget_errors", "TracePulse\nverify_fix"]
    y-axis "Tokens" 0 --> 14000
    bar [12000, 10000, 1000, 500]
```

TracePulse pre-parses, scores, and deduplicates. The agent gets the exact file:line in one call instead of scanning raw logs.

**That's 12,000 tokens down to 1,000. Per error. Per session.**

---

## The Data Pipeline

Every log line goes through 10 stages before the agent sees it:

```mermaid
graph TD
    A["Raw Log Line"] --> B["ANSI Strip"]
    B --> C["Secret Redaction\n(13 patterns)"]
    C --> D["Hot-Reload Detection\n(11 dev tools)"]
    D --> E["Multi-Line Accumulator\n(tracebacks)"]
    E --> F["Parser Registry\n(20 parsers)"]
    F --> G["Signal Scoring\n(0-100)"]
    G --> H["Fingerprint Dedup"]
    H --> I["Ring Buffer\n(500 events)"]
    I --> J["26 MCP Tools"]
    J --> K["AI Agent"]

    style A fill:#ff6644,stroke:#333,color:#fff
    style F fill:#ffaa44,stroke:#333,color:#000
    style G fill:#ffcc44,stroke:#333,color:#000
    style I fill:#4488ff,stroke:#333,color:#fff
    style K fill:#44cc44,stroke:#333,color:#000
```

---

## The Three-Layer Debugging Stack

```mermaid
graph TB
    Agent["AI Coding Agent"]

    subgraph "Layer 1: Backend"
        TP["TracePulse\n26 tools\nerrors, logs, builds,\ntests, infrastructure"]
    end

    subgraph "Layer 2: Browser"
        CDT["Chrome DevTools MCP\nconsole, network,\nperformance, DOM"]
    end

    subgraph "Layer 3: Visual UI"
        VG["ViewGraph\nDOM capture, a11y,\nlayout, annotations"]
    end

    Agent <--> TP
    Agent <--> CDT
    Agent <--> VG

    style TP fill:#ff9966,stroke:#333,color:#000
    style CDT fill:#6699ff,stroke:#333,color:#fff
    style VG fill:#66cc99,stroke:#333,color:#000
    style Agent fill:#fff,stroke:#333,stroke-width:2px,color:#000
```

Each tool owns its layer. Together they give the agent complete visibility.

---

## The Edit-Verify Loop

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant TP as TracePulse
    participant Server as Dev Server

    Agent->>Agent: Edit source file
    Server->>TP: stderr: "TypeError at users.py:42"
    TP->>TP: Parse + Score (75/100)

    Agent->>TP: get_errors()
    TP-->>Agent: {file: "users.py", line: 42, score: 75}

    Agent->>Agent: Fix the bug

    Agent->>TP: verify_fix(10)
    Server->>TP: "Server reloaded successfully"
    TP->>TP: Detect hot-reload
    TP-->>Agent: {verdict: "PASS", hot_reload: true}
```

---

## What Makes It Different

| Capability | TracePulse | Sentry MCP | Chrome DevTools | BrowserTools |
|-----------|:---------:|:---------:|:--------------:|:-----------:|
| Backend error parsing | **Yes (20)** | Yes (prod) | No | No |
| Signal scoring (0-100) | **Yes** | No | No | No |
| Fingerprint dedup | **Yes** | No | No | No |
| Hot-reload detection | **Yes (11)** | No | No | No |
| Dev-time (seconds) | **Yes** | No (minutes) | Yes | Yes |
| Works without browser | **Yes** | Yes | No | No |
| Test runner integration | **Yes** | No | No | No |
| Infrastructure discovery | **Yes** | No | No | No |
| Agent skill files | **Yes (10)** | No | No | No |
| Zero config | **Yes** | No | Yes | No |

[Full feature matrix ->](comparison/feature-matrix.md)

---

## Real-World Results

From 3 agent sessions on a production project:

```mermaid
pie title Tool Usage (70+ invocations)
    "get_build_errors (23x)" : 23
    "watch_for_errors (13x)" : 13
    "get_errors (10x)" : 10
    "get_runtime_status (8x)" : 8
    "verify_fix (5x)" : 5
    "Other tools (11x)" : 11
```

| Metric | Value |
|--------|-------|
| Manual vite builds replaced | 15+ |
| Time saved (build checks) | 20+ minutes |
| Real bugs caught | 3 |
| Feature request to bug catch | Same day |
| Agent wishlist items shipped | 21/22 (95%) |

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
