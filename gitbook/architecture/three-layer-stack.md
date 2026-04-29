# The Three-Layer Stack

The complete agentic debugging stack has three layers. Each tool owns its layer.

## The Stack

```mermaid
graph TB
    Agent["AI Coding Agent
    (Kiro, Cursor, Claude Code, Copilot)"]

    subgraph "Layer 1: Backend (TracePulse)"
        direction LR
        TP1["Error Detection
        20 parsers"]
        TP2["Signal Scoring
        0-100"]
        TP3["24 MCP Tools"]
    end

    subgraph "Layer 2: Browser (Chrome DevTools MCP)"
        direction LR
        CDT1["Console Messages"]
        CDT2["Network Requests"]
        CDT3["Performance Traces"]
    end

    subgraph "Layer 3: Visual UI (ViewGraph)"
        direction LR
        VG1["DOM Capture"]
        VG2["Accessibility Audit"]
        VG3["User Annotations"]
    end

    Agent <--> TP3
    Agent <--> CDT1
    Agent <--> VG1

    style Agent fill:#fff,stroke:#333,stroke-width:2px
```

## When to Use Which

```mermaid
flowchart TD
    Problem["Something broke"]

    Problem --> Q1{"Backend error?
    (crash, 500, traceback)"}
    Q1 -->|Yes| TP["TracePulse
    get_errors()"]

    Q1 -->|No| Q2{"Browser error?
    (console, network)"}
    Q2 -->|Yes| CDT["Chrome DevTools MCP
    list_console_messages()"]

    Q2 -->|No| Q3{"Visual bug?
    (layout, styling)"}
    Q3 -->|Yes| VG["ViewGraph
    get_capture()"]

    Q3 -->|No| Q4{"Need to verify fix?"}
    Q4 -->|Backend| TP2["TracePulse
    verify_fix()"]
    Q4 -->|Browser| CDT2["Chrome DevTools MCP
    take_snapshot()"]
    Q4 -->|Visual| VG2["ViewGraph
    compare_captures()"]

    style TP fill:#ff9966
    style TP2 fill:#ff9966
    style CDT fill:#66aaff
    style CDT2 fill:#66aaff
    style VG fill:#66ff99
    style VG2 fill:#66ff99
```

## Data Flow Across Layers

```mermaid
sequenceDiagram
    participant User
    participant Agent as AI Agent
    participant TP as TracePulse
    participant CDT as Chrome DevTools
    participant VG as ViewGraph

    User->>Agent: "The export page is broken"

    Agent->>TP: get_errors(message_contains: "/export")
    TP-->>Agent: 500 error at export.py:42

    Agent->>CDT: list_network_requests()
    CDT-->>Agent: POST /api/export -> 500

    Agent->>CDT: get_network_request(reqid)
    CDT-->>Agent: Response body: {"detail": "Project not found"}

    Agent->>Agent: Fix export.py

    Agent->>TP: verify_fix(10)
    TP-->>Agent: PASS - zero errors

    Agent->>CDT: navigate_page(reload)
    Agent->>CDT: wait_for("Export complete")
    CDT-->>Agent: Page loaded correctly

    Agent->>User: "Fixed. The export works now."
```

## Responsibility Matrix

| Capability | TracePulse | Chrome DevTools MCP | ViewGraph |
|------------|:---------:|:-------------------:|:---------:|
| Backend exceptions | **Yes** | | |
| Build/compile errors | **Yes** | | |
| Test failures | **Yes** | | |
| Browser console | | **Yes** | |
| Network requests | | **Yes** | |
| Request/response bodies | | **Yes** | |
| Screenshots | | **Yes** | |
| DOM inspection | | **Yes** | **Yes** |
| Accessibility audit | | **Yes** | **Yes** |
| User annotations | | | **Yes** |
| Visual regression | | | **Yes** |
