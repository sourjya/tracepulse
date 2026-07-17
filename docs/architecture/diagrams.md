# TracePulse Architecture Diagrams

Mermaid diagrams for key architectural concepts. Render these in any Mermaid-compatible viewer (GitHub, VS Code, etc.).

---

## 1. High-Level System Context

```mermaid
graph LR
    DevServer["Dev Server<br/>(any language)"]
    TracePulse["TracePulse<br/>MCP Server"]
    Agent["AI Coding Agent<br/>(Kiro, Claude Code,<br/>Cursor, etc.)"]
    Browser["Browser<br/>(Chrome)"]

    DevServer -->|stdout/stderr| TracePulse
    TracePulse -->|MCP Protocol<br/>JSON-RPC over stdio| Agent
    Browser -.->|HTTP errors<br/>via log collector| TracePulse
    Agent -->|"calls tools:<br/>get_errors()<br/>watch_for_errors()"| TracePulse
```

---

## 2. Data Pipeline Flow

```mermaid
flowchart TD
    A[Raw Log Line] --> B[ANSI Stripping]
    B --> C[Secret Redaction]
    C --> D{Hot-Reload<br/>Pattern?}
    D -->|Yes| E[Inject Synthetic<br/>Marker Event]
    D -->|No| F[Parser Registry<br/>25 parsers in order]
    E --> G[Ring Buffer]
    F --> H{Parser<br/>Matched?}
    H -->|Yes| I[Normalize to<br/>RuntimeEvent]
    H -->|No| J[Store as Raw<br/>Info Event]
    I --> K[Signal Scoring<br/>0-100]
    K --> L[Fingerprint<br/>SHA-256 Dedup]
    L --> G
    J --> G
    G --> M[MCP Tool<br/>Handlers]
```

---

## 3. RuntimeEvent Entity

```mermaid
erDiagram
    RuntimeEvent {
        string id PK "UUIDv4"
        number timestamp "Unix ms"
        string source "server-stdout | server-stderr | build-error | docker-log"
        string service "main | api | worker"
        string level "error | warn | info | debug"
        string message "max 500 chars"
        string stack_trace "max 15 frames (optional)"
        string fingerprint "SHA-256 dedup key"
        number signal_score "0-100"
        string signal_strength "high | medium | low"
        string raw "max 1000 chars"
        number first_seen "Unix ms"
        number occurrence_count "increments on dedup"
    }

    EventContext {
        string file "source file path (optional)"
        number line "line number (optional)"
        number column "column number (optional)"
        string framework "node | python | typescript | etc."
        string error_type "TypeError | TS2345 | etc."
        string trace_id "W3C trace ID (optional)"
    }

    RuntimeEvent ||--o| EventContext : "has context"
```

---

## 4. Signal Scoring Breakdown

```mermaid
graph LR
    subgraph "Additive Scoring (0-100)"
        A["Unhandled Exception<br/>+40"] --> Total
        B["Stack Trace Present<br/>+20"] --> Total
        C["User Code Location<br/>+15"] --> Total
        D["HTTP 5xx<br/>+15"] --> Total
        E["Error Level<br/>+10"] --> Total
        F["First Occurrence<br/>+10"] --> Total
        G["Warning Level<br/>+5"] --> Total
        H["Seen 3+ Times<br/>-5"] --> Total
    end

    Total --> High["HIGH ≥50"]
    Total --> Medium["MEDIUM 20-49"]
    Total --> Low["LOW <20"]
```

---

## 5. Parser Registry Priority

```mermaid
flowchart LR
    Line[Log Line] --> P1[JSON<br/>Structured]
    P1 -->|no match| P2[Node.js]
    P2 -->|no match| P3[Python]
    P3 -->|no match| P4[Go]
    P4 -->|no match| P5[Java]
    P5 -->|no match| P6[Rust]
    P6 -->|no match| P7[TypeScript<br/>Compiler]
    P7 -->|no match| P8[ESLint]
    P8 -->|no match| P9[Vite/<br/>webpack]
    P9 -->|no match| Raw[Store as<br/>Raw Event]

    P1 -->|match| Result[ParsedError]
    P2 -->|match| Result
    P3 -->|match| Result
    P4 -->|match| Result
    P5 -->|match| Result
    P6 -->|match| Result
    P7 -->|match| Result
    P8 -->|match| Result
    P9 -->|match| Result
```

---

## 6. Ring Buffer with Subscription

```mermaid
sequenceDiagram
    participant Pipeline
    participant Buffer as Ring Buffer
    participant Watch as Watch Controller
    participant Tool as MCP Tool

    Watch->>Buffer: subscribe(callback)
    Buffer-->>Watch: unsubscribe function

    Pipeline->>Buffer: push(event)
    Buffer->>Buffer: Check fingerprint dedup
    alt New fingerprint
        Buffer->>Buffer: Write to slot[writePtr]
        Buffer->>Watch: callback(event)
    else Duplicate fingerprint
        Buffer->>Buffer: Update occurrence_count
        Note over Buffer,Watch: No notification for dedup
    end

    Tool->>Buffer: query({ level: "error", limit: 10 })
    Buffer-->>Tool: RuntimeEvent[] (newest first)
```

---

## 7. Watch Mode Flow

```mermaid
sequenceDiagram
    participant Agent
    participant MCP as MCP Server
    participant Watch as Watch Controller
    participant Buffer as Ring Buffer
    participant DevServer as Dev Server

    Agent->>MCP: watch_for_errors(15)
    MCP->>Watch: watchForErrors(buffer, 15)
    Watch->>Buffer: subscribe(callback)

    Note over Agent,DevServer: Agent edits code...

    DevServer->>Buffer: push(hot-reload event)
    Buffer->>Watch: callback(hot-reload)
    Watch->>Watch: hot_reload_detected = true

    DevServer->>Buffer: push(error event)
    Buffer->>Watch: callback(error)
    Watch->>Watch: collect error

    Note over Watch: 15 seconds elapsed

    Watch->>Buffer: unsubscribe()
    Watch-->>MCP: { events: [...], hot_reload_detected: true }
    MCP-->>Agent: MCP response with errors
```

---

## 8. Multi-Process Architecture

```mermaid
graph TD
    subgraph TracePulse
        Registry[Service Registry]
        Buffer[Shared Ring Buffer<br/>500 events]
        Pipeline[Processing Pipeline]
        MCP[MCP Server<br/>8 tools]
    end

    subgraph Collectors
        PC1[Process Collector<br/>api]
        PC2[Process Collector<br/>worker]
        DC[Docker Log<br/>Collector]
    end

    PC1 -->|"tagged: service=api"| Pipeline
    PC2 -->|"tagged: service=worker"| Pipeline
    DC -->|"tagged: service=db"| Pipeline

    Pipeline --> Buffer
    Buffer --> MCP

    PC1 -.->|status updates| Registry
    PC2 -.->|status updates| Registry
    DC -.->|status updates| Registry

    MCP -->|list_services| Registry
    MCP -->|get_errors| Buffer
```

---

## 9. Frontend-Backend Correlation

```mermaid
flowchart TD
    subgraph Browser
        FE[HTTP 500 Response<br/>url: /api/users<br/>traceId: abc123]
    end

    subgraph "Dev Server"
        BE[TypeError: Cannot read 'id'<br/>file: users.ts:42<br/>trace_id: abc123]
    end

    FE --> FEB[Frontend Error Buffer<br/>200 max, 5min TTL]
    BE --> BEB[Backend Event Buffer<br/>500 max]

    FEB --> CE{Correlation<br/>Engine}
    BEB --> CE

    CE -->|"1. Trace ID match"| High["Confidence: 1.0<br/>Method: trace-id"]
    CE -->|"2. URL + time <500ms"| Med["Confidence: 0.9<br/>Method: url-timestamp"]
    CE -->|"3. URL + time <2000ms"| Low["Confidence: 0.7<br/>Method: url-timestamp"]
    CE -->|"4. No match"| None["Not correlated"]
```

---

## 10. Module Dependency Graph

```mermaid
graph TD
    CLI[cli.ts] --> MCP[mcp/server.ts]
    CLI --> Pipeline[pipeline/]
    CLI --> Collectors[collectors/]
    CLI --> Config[config/]

    MCP --> Buffer[store/ring-buffer.ts]
    MCP --> Tools[tools/]
    MCP --> Correlation_Engine[correlation/correlation-engine.ts]

    Pipeline --> Parsers[parsers/ × 9]
    Pipeline --> Redactor[pipeline/secret-redactor.ts]
    Pipeline --> Normalizer[pipeline/event-normalizer.ts]
    Pipeline --> Scorer[pipeline/signal-scorer.ts]
    Pipeline --> Fingerprinter[pipeline/fingerprinter.ts]

    Tools --> Buffer
    Tools --> Query[query/timeline-query.ts]
    Tools --> Watch[watch/watch-controller.ts]
    Tools --> FEBuffer[correlation/frontend-error-buffer.ts]
    Tools --> FEBECorr[correlation/fe-be-correlation.ts]
    Tools --> FPHistory[persistence/fingerprint-history.ts]
    Tools --> GitDiff[correlation/git-diff-correlator.ts]

    Watch --> Buffer
    Collectors --> Services[services/service-registry.ts]

    Buffer --> Types[types/events.ts]
    Parsers --> Types
    Tools --> Types
```
