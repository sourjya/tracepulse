# How It Works

TracePulse sits between your dev server and your AI agent. It reads logs, parses errors, and serves structured data.

## The Big Picture

```mermaid
graph LR
    subgraph "Your Machine"
        Server["Dev Server
        (npm run dev,
        python manage.py,
        go run main.go)"]

        TP["TracePulse
        MCP Server"]

        Agent["AI Coding Agent"]
    end

    Server -->|"stdout
    stderr"| TP
    TP -->|"MCP Protocol
    (JSON-RPC)"| Agent
    Agent -->|"Tool calls:
    get_errors()
    verify_fix()"| TP
```

## What Happens to Each Log Line

```mermaid
graph TD
    A["Raw log line from dev server"] --> B["Strip ANSI colors"]
    B --> C{"Contains secret?"}
    C -->|Yes| D["Replace with [REDACTED]"]
    C -->|No| E["Pass through"]
    D --> F["Check hot-reload patterns"]
    E --> F
    F -->|"Match (e.g. Vite compiled)"| G["Inject reload marker"]
    F -->|No match| H["Try 20 parsers"]
    G --> H
    H -->|"Parser matched
    (e.g. Python traceback)"| I["Extract file, line,
    error type, stack trace"]
    H -->|No match| J["Store as raw
    info event"]
    I --> K["Score 0-100"]
    J --> K
    K --> L["Store in ring buffer
    (500 events max)"]
    L --> M["Available via
    24 MCP tools"]

    style A fill:#f96
    style L fill:#6af
    style M fill:#6f6
```

## Two Modes of Operation

```mermaid
graph TB
    subgraph "Start Mode"
        TP1["TracePulse spawns
        your dev server"]
        Child["Child process
        (npm run dev)"]
        TP1 -->|"spawn"| Child
        Child -->|"stdout/stderr
        piped"| TP1
    end

    subgraph "Attach Mode"
        Server2["Dev server
        (already running)"]
        Log["Log file
        (server.log)"]
        TP2["TracePulse tails
        the log file"]
        Server2 -->|writes| Log
        TP2 -->|"fs.watch +
        readline"| Log
    end
```

## The Edit-Verify Loop

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant TP as TracePulse
    participant Server as Dev Server

    loop Until fix works
        Agent->>Agent: Edit code
        Agent->>TP: verify_fix(10)
        Note over TP: Watches for 10 seconds
        Server->>TP: Hot-reload event
        Server->>TP: (errors if any)
        TP-->>Agent: PASS or FAIL
    end
```

## Learn More

- [Data Pipeline (10 stages)](pipeline.md)
- [Signal Scoring](../features/signal-scoring.md)
- [20 Error Parsers](../features/parsers.md)
- [The Three-Layer Stack](three-layer-stack.md)
