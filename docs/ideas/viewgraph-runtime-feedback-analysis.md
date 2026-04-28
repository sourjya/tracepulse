# ViewGraph × Runtime Feedback Loop: Product Architecture Analysis

**Date:** 2026-04-27  
**Purpose:** Evaluate how the runtime feedback loop research applies to ViewGraph as a product, identify overlaps, complementary opportunities, and anti-patterns.

---

## A. WHAT VIEWGRAPH IS

ViewGraph is a **UI context layer for agentic coding** - a browser extension + MCP server that captures structured DOM snapshots from web pages and exposes them to AI coding assistants via the Model Context Protocol.

### Architecture

```
Browser Extension (Chrome/Firefox)
  ├── Content script: DOM traversal, annotation injection, 17 enrichment collectors
  ├── Background service worker: capture orchestration, HTTP push, request polling
  └── Sidebar UI: Review tab (annotations) + Inspect tab (network, console, diagnostics)
       │
       │ HTTP POST / WebSocket / Native Messaging
       ▼
MCP Server (Node.js, stdio transport)
  ├── HTTP receiver (port 9876-9879): receives captures from extension
  ├── WebSocket server: real-time annotation sync
  ├── File watcher + indexer: in-memory capture index
  ├── 38 MCP tools: query, analysis, bidirectional, baseline, annotation intelligence
  └── Parsers + analysis modules: a11y, layout, diff, source linking, patterns
       │
       │ MCP (JSON-RPC over stdio)
       ▼
AI Agent (Kiro, Claude Code, Cursor, etc.)
```

### Key Capabilities

- **DOM capture** with computed styles, bounding boxes, z-index, accessibility state
- **17 enrichment collectors**: network, console, axe-core, performance, animations, event listeners, stacking contexts, focus chain, scroll containers, landmarks, components, intersection state, visibility, CSS custom properties, storage, transient UI state
- **Human annotation**: click/drag to annotate, severity/category, page notes
- **38 MCP tools**: query, audit, diff, baseline, source linking, spec generation
- **Bidirectional**: agent can request captures from the extension
- **Multi-export**: MCP (agent), Markdown (Jira/GitHub), ZIP (full report)
- **Journey recording**: auto-capture on SPA navigation, session grouping
- **Auto-capture on HMR**: detects Vite/webpack hot-reload

### What ViewGraph Is NOT

- Not a runtime debugger - it captures DOM state, not execution traces
- Not a backend monitor - it sees browser-side data only
- Not a live process inspector - it takes snapshots, not continuous streams
- Not a log aggregator - it captures console/network at snapshot time, not continuously

---

## B. OVERLAP ANALYSIS

ViewGraph already implements several concepts from the research, but with a fundamentally different orientation: **snapshot-based UI context** vs. **continuous runtime monitoring**.

### 1. Browser Extension Capturing Runtime Data

| Research Concept | ViewGraph Implementation | Gap |
|---|---|---|
| Chrome extension monitors console logs | `console-collector.js` captures console errors/warnings at snapshot time | ViewGraph captures at a point in time; research envisions continuous streaming |
| Extension captures network requests/failures | `network-collector.js` captures via Performance API | Same - snapshot vs. stream. ViewGraph gets what happened up to capture time |
| Extension sends data to middleware | Background script POSTs to MCP server HTTP receiver (`http-receiver.js`) | Architecturally identical to BrowserTools MCP's extension→middleware→MCP pattern |
| Screenshot capture | `chrome.tabs.captureVisibleTab()` in background.js | Already implemented |

### 2. MCP Server as Agent Interface

| Research Concept | ViewGraph Implementation | Gap |
|---|---|---|
| MCP server exposes tools to any agent | 38 MCP tools via `@modelcontextprotocol/sdk` | Fully implemented - same pattern as research's "Layer 3: MCP Server" |
| Structured event normalization | ViewGraph v2 JSON format with typed nodes, metadata, enrichment sections | ViewGraph normalizes DOM state; research normalizes runtime events. Different data, same principle |
| Token budgeting | `get_page_summary` returns compact summary if capture >100KB; tools return filtered subsets | Implemented for DOM data |
| Agent-initiated data retrieval (pull model) | `get_latest_capture`, `get_annotations`, `audit_accessibility` etc. | Fully pull-based, matching research's Phase 1-3 recommendation |

### 3. Three-Tier Architecture (Extension → Middleware → MCP)

The research cites BrowserTools MCP's architecture as a reference:
```
Chrome Extension → Node Server (Middleware) → MCP Server → Agent
```

ViewGraph's architecture is structurally identical:
```
Chrome Extension → HTTP Receiver (server/src/http-receiver.js) → MCP Tools → Agent
```

The HTTP receiver acts as the middleware layer - it receives captures, validates them, writes to disk, and the MCP tools read from disk. The WebSocket server adds real-time sync on top.

### 4. Fingerprinting and Deduplication

| Research Concept | ViewGraph Implementation |
|---|---|
| Error fingerprints for deduplication | `detect_recurring_issues` tool uses element selectors + annotation text as fingerprint keys |
| Ring buffer with max size | Indexer maintains bounded in-memory index; rolling archive auto-archives old captures |
| Occurrence counting | `detect_recurring_issues` counts how many times an element is flagged across captures |

### 5. Bidirectional Communication

| Research Concept | ViewGraph Implementation |
|---|---|
| Agent requests data from browser | `request_capture` tool → extension polls `/requests/pending` → captures and returns |
| Request lifecycle (pending → ack → complete) | `request-queue.js` implements exactly this state machine |

### 6. Auto-Detection and Watch Mode

| Research Concept | ViewGraph Implementation |
|---|---|
| Watch for changes after code edit | `auto-capture.js` detects HMR events (Vite/webpack) and auto-captures after DOM settles |
| Continuous monitoring | `continuous-capture.js` provides periodic DOM snapshots |
| Journey/session tracking | `journey-recorder.js` auto-captures on SPA navigation |

**Summary**: ViewGraph already implements the research's Pattern A (MCP Bridge) architecture for **DOM/UI state**. The gap is that ViewGraph captures snapshots of rendered state, while the research targets continuous runtime error streams.

---

## C. COMPLEMENTARY OPPORTUNITIES

### Opportunity 1: Runtime Error Context in Captures (Enrichment Enhancement)

**What**: Enhance existing enrichment collectors to capture richer runtime error context - not just "what errors exist at snapshot time" but "what errors occurred since last capture" with stack traces, occurrence counts, and correlation data.

**Research Pattern**: Pattern A (MCP Bridge) - specifically the event normalization and buffering layer.

**How it fits ViewGraph's architecture**: The `console-collector.js` and `network-collector.js` already run during capture. Enhancement would:
- Add a persistent error buffer in the content script that accumulates errors between captures (similar to the research's `EventBuffer` class)
- On capture, include the full error history since last capture, not just current state
- Add fingerprinting to deduplicate repeated errors
- Include stack traces (currently console-collector captures messages but may truncate stacks)

**Implementation**: Modify `extension/lib/collectors/console-collector.js` to maintain a ring buffer between captures. Add a new `error-history` section to the capture format. The MCP server already parses enrichment sections - just needs a new query tool.

**Complexity**: Low - extends existing collector infrastructure  
**Product Value**: High - directly addresses "agent can't see what went wrong" for frontend errors without requiring a separate tool

---

### Opportunity 2: `watch_for_errors` MCP Tool (Post-Edit Verification)

**What**: A new MCP tool that tells the agent "watch for errors for N seconds after I make this change." The agent edits code, HMR fires, and the tool returns any new console errors or network failures that appeared.

**Research Pattern**: Pattern A+ (Watch Mode) - specifically the `watch_for_errors(duration_seconds)` tool from Section 5.3.

**How it fits ViewGraph's architecture**: ViewGraph already has:
- Auto-capture on HMR (`auto-capture.js` detects Vite/webpack hot-reload)
- WebSocket connection between extension and server (`ws-server.js` / `ws-client.js`)
- Request/response pattern (`request_capture` → poll → complete)

The enhancement would:
1. Agent calls `watch_for_errors(15)` via MCP
2. Server sends a "start watching" message to extension via WebSocket
3. Extension activates error buffering (console + network collectors in continuous mode)
4. After duration expires (or HMR + settle detected), extension sends accumulated errors to server
5. Tool returns the error list to the agent

**Implementation**: New MCP tool in `server/src/tools/`, new WebSocket message type, new "watch mode" in the content script that activates collectors continuously for a bounded period.

**Complexity**: Medium - requires WebSocket coordination and a new content script mode  
**Product Value**: High - this is the core "edit → verify" loop that the research identifies as the #1 friction point. ViewGraph is uniquely positioned to deliver this because it already has the extension-to-server communication channel.

---

### Opportunity 3: Error-Triggered Auto-Capture (Proactive Detection)

**What**: When a new, unique error appears in the browser console (new fingerprint), automatically capture the DOM state at that moment - without the user clicking anything.

**Research Pattern**: Pattern D (Continuous Watch Mode) - "On new error (fingerprint not seen before): capture error + surrounding context."

**How it fits ViewGraph's architecture**: ViewGraph already has:
- `auto-capture.js` that triggers captures on HMR events
- `continuous-capture.js` for periodic captures
- Console error interception in the content script
- The "panic capture" idea doc (`docs/ideas/panic-capture.md`) which envisions instant mid-action captures

The enhancement would:
1. Content script maintains a fingerprint set of seen errors
2. When a new error fingerprint appears → trigger a full DOM capture automatically
3. Capture metadata includes `captureMode: 'error-triggered'` and the triggering error
4. Agent can then correlate the DOM state with the error

**Implementation**: Combine the console-collector's error interception with auto-capture's trigger mechanism. Add fingerprinting logic (research provides the algorithm in Section 5.2). Wire to existing capture pipeline.

**Complexity**: Medium - the pieces exist but need new orchestration logic  
**Product Value**: High - catches transient errors that disappear before the user can manually capture. Directly complements the "panic capture" idea.

---

### Opportunity 4: Frontend-Backend Error Correlation

**What**: When the extension captures a network failure (e.g., POST /api/login → 500), and the developer also has a backend log source, correlate the frontend failure with the backend stack trace.

**Research Pattern**: Pattern A (MCP Bridge) - specifically "cross-source correlation" from Section 5.4.2 and the `get_error_context` tool.

**How it fits ViewGraph's architecture**: ViewGraph currently captures network failures via `network-collector.js` but has no backend visibility. This would require:
- A new optional backend collector (log file tailing or process stderr capture)
- Correlation by timestamp and request URL/path
- A new MCP tool: `get_correlated_errors` that shows frontend network failure + backend stack trace together

**Implementation**: New server-side module (`server/src/collectors/backend-log-collector.js`) that tails a configured log file or process. Correlation logic matches network failures by timestamp window + URL path. New MCP tool exposes correlated pairs.

**Complexity**: High - introduces a new data source type (backend logs) that ViewGraph has never handled  
**Product Value**: Medium - powerful for full-stack debugging but moves ViewGraph away from its core "UI context" positioning. Many users are frontend-only.

---

### Opportunity 5: Hypothesis-Driven Instrumentation via Annotations

**What**: When the agent is debugging a complex UI issue, it can request the extension to add temporary `console.log` statements or DOM observers at specific points, then read the results in the next capture.

**Research Pattern**: Pattern B (Observe-Hypothesize-Instrument-Verify) - Cursor Debug Mode pattern.

**How it fits ViewGraph's architecture**: ViewGraph's bidirectional communication (`request_capture` with `guidance` field) already lets the agent tell the extension what to look for. Enhancement would:
- Agent sends instrumentation requests via a new MCP tool
- Extension injects temporary observers (MutationObserver on specific elements, event listeners, performance marks)
- Next capture includes the instrumentation results
- Agent reads results, diagnoses, requests cleanup

**Implementation**: New MCP tool `request_instrumentation`, new content script module that injects/removes temporary observers, results included in capture enrichment.

**Complexity**: High - runtime code injection in the user's page raises security and stability concerns  
**Product Value**: Medium - powerful for hard bugs but risky. ViewGraph's principle is "never injects into or manipulates the running application directly" (from README). This would violate that principle.

---

### Opportunity 6: Structured Error Summaries in Page Summary

**What**: Enhance `get_page_summary` to include a structured error summary - count of console errors by type, failed network requests with status codes, and a "health score" for the page.

**Research Pattern**: Pattern C (Telemetry-as-Prompt) - specifically "structured events over free-text logs" and "token budgeting."

**How it fits ViewGraph's architecture**: `get_page_summary` already returns a compact overview (URL, title, viewport, element counts, clusters). The enrichment data (console errors, network failures) is already in the capture but not surfaced in the summary.

**Implementation**: Modify `server/src/tools/get-page-summary.js` to extract error counts from the enrichment sections and include them in the summary response. Add a simple health score (0 errors = healthy, 1-3 = warnings, 4+ = unhealthy).

**Complexity**: Low - pure server-side change, data already exists in captures  
**Product Value**: Medium - gives the agent an instant signal about page health without loading the full capture. Enables the "check after edit" workflow with minimal token cost.

---

### Opportunity 7: Error Fingerprint Persistence and Learning

**What**: Maintain a persistent store of error fingerprints across captures, tracking when each error first appeared, when it was last seen, and whether it was resolved. Enable the agent to ask "what errors are new since my last fix?"

**Research Pattern**: Pattern C (Telemetry-as-Prompt) - specifically "error fingerprints" as dedup keys and retrieval keys for past incidents.

**How it fits ViewGraph's architecture**: ViewGraph already has:
- `detect_recurring_issues` tool that finds elements flagged repeatedly
- `analyze_patterns` tool that generates recommendations from resolved annotations
- Rolling archive with `index.json` tracking capture history

Enhancement would add a `fingerprints.json` file in `.viewgraph/` that persists error fingerprints across sessions, with first-seen/last-seen/resolved timestamps.

**Implementation**: New server module `server/src/error-fingerprints.js`, updated console/network enrichment parsing to extract and store fingerprints, new MCP tool `get_new_errors_since(timestamp)`.

**Complexity**: Low-Medium - file-based persistence is simple; fingerprint extraction from unstructured console output needs heuristics  
**Product Value**: Medium - enables the "what broke since my last change?" workflow without requiring the developer to manually compare captures

---

### Opportunity 8: Build Error Integration

**What**: Watch the dev server's build output (TypeScript errors, Vite/webpack compilation failures) and include them in the capture or expose via a dedicated MCP tool.

**Research Pattern**: Pattern A (MCP Bridge) - Section 5.1.3 "Build/Compile Errors."

**How it fits ViewGraph's architecture**: ViewGraph's auto-capture already detects HMR events, meaning it knows when the build system is active. The extension could also detect build failure indicators in the page (Vite's error overlay, webpack's error screen).

**Implementation approach 1 (extension-side)**: Detect Vite/webpack error overlays in the DOM during capture. These frameworks inject visible error screens - the traverser would capture them as DOM nodes. Low effort, already partially works.

**Implementation approach 2 (server-side)**: The MCP server could optionally tail the dev server's stderr for build errors. This is closer to the research's backend log collector but scoped to build output only.

**Complexity**: Low (approach 1) / Medium (approach 2)  
**Product Value**: Medium - build errors are already visible in the terminal, but having them in the same MCP context as the DOM state helps the agent correlate "page is blank because TypeScript failed to compile"

---

## D. PRODUCT ARCHITECTURE DECISIONS

### Priority 1: Structured Error Summaries in Page Summary (Opportunity 6)

**Rationale**: Lowest effort, immediate value. The data already exists in captures - just surface it in the summary tool. Gives agents an instant "is the page healthy?" signal. Zero extension changes needed.

**Ship in**: 1-2 days. Server-only change.

### Priority 2: Runtime Error Buffer in Captures (Opportunity 1)

**Rationale**: Natural extension of existing collectors. Transforms ViewGraph from "what errors exist now" to "what errors happened since you last looked." High value for the edit→verify loop. Stays within ViewGraph's snapshot model - just a richer snapshot.

**Ship in**: 3-4 days. Extension collector enhancement + new enrichment section + server parsing.

### Priority 3: `watch_for_errors` Tool (Opportunity 2)

**Rationale**: This is the killer feature that bridges ViewGraph's snapshot model with the research's continuous monitoring vision. The agent edits code → calls watch → gets errors back. ViewGraph already has all the infrastructure (WebSocket, auto-capture on HMR, request/response pattern). This positions ViewGraph as the tool that closes the frontend feedback loop.

**Ship in**: 5-7 days. New tool, WebSocket message type, content script watch mode.

### Priority 4: Error-Triggered Auto-Capture (Opportunity 3)

**Rationale**: Natural evolution of auto-capture. Instead of only capturing on HMR, also capture on new errors. Catches transient bugs. Complements the "panic capture" idea already in the roadmap. Stays within ViewGraph's "capture snapshots" model.

**Ship in**: 3-5 days. Builds on existing auto-capture infrastructure.

### Priority 5: Error Fingerprint Persistence (Opportunity 7)

**Rationale**: Enables "what's new?" queries. Low complexity, builds on existing recurring-issues detection. Makes the agent smarter about which errors to focus on.

**Ship in**: 2-3 days. Server-side persistence + new tool.

### Deferred: Frontend-Backend Correlation (Opportunity 4)

**Rationale**: High value but high complexity and scope creep risk. ViewGraph's identity is "UI context layer" - adding backend log tailing moves it toward being a general observability tool. Better to let a dedicated runtime feedback tool (per the research) handle backend, and ViewGraph handles frontend. They can coexist as separate MCP servers.

### Deferred: Hypothesis-Driven Instrumentation (Opportunity 5)

**Rationale**: Violates ViewGraph's core principle of never injecting into the running application. The security and stability risks are significant. Better suited to a separate tool (like the research's standalone runtime feedback daemon) that has explicit permission to modify running code.

---

## E. WHAT VIEWGRAPH SHOULD NOT DO

### 1. Become a Backend Log Aggregator

The research's Pattern A includes tailing server stdout/stderr, Docker container logs, and framework-specific error parsers. ViewGraph should **not** build this. Reasons:
- ViewGraph's identity is "UI context layer" - backend logs are a different domain
- The extension architecture is browser-native; backend log tailing requires a separate daemon
- Adding backend support would confuse the product positioning and bloat the MCP tool surface
- A separate `@runtime-feedback/core` MCP server (per the research) can coexist alongside ViewGraph

**Instead**: ViewGraph should capture frontend evidence of backend failures (network 4xx/5xx responses, error messages in the DOM) and let a companion tool handle the backend side.

### 2. Implement CDP Direct Connection

The research recommends connecting to Chrome via CDP WebSocket (`--remote-debugging-port=9222`) for continuous console/network monitoring. ViewGraph should **not** do this because:
- ViewGraph already has a browser extension that captures the same data more reliably
- CDP requires Chrome to be launched with special flags - worse UX than "install extension"
- The extension approach works with the user's actual browsing session, not a separate debug instance
- CDP is better suited to a headless/automated tool, not a human-in-the-loop review tool

**Instead**: ViewGraph's extension IS the browser integration. It's superior to CDP for ViewGraph's use case because it works in the user's real browser without special configuration.

### 3. Spawn or Manage Dev Server Processes

The research's Phase 1 MVP involves spawning the dev server as a child process to capture its stdout/stderr. ViewGraph should **not** do this because:
- ViewGraph runs as an MCP server spawned by the agent - it shouldn't spawn additional processes
- Managing dev server lifecycle adds complexity and failure modes
- The developer already has their dev server running - ViewGraph observes the result in the browser

**Instead**: ViewGraph observes the rendered output of whatever dev server the developer is running. It doesn't need to know or care what backend technology is in use.

### 4. Implement Proactive Push Notifications to the Agent

The research's Pattern D (Continuous Watch Mode) pushes errors to the agent without being asked. ViewGraph should be cautious here because:
- MCP's notification model is less mature than tool calls
- Push notifications risk overwhelming the agent with noise
- ViewGraph's pull model (agent calls tools when needed) is simpler and more reliable
- The `watch_for_errors` tool (Opportunity 2) provides a bounded, agent-controlled alternative

**Instead**: Implement the bounded `watch_for_errors` pattern where the agent explicitly opts into a monitoring window. This gives the agent control over when it receives runtime data without the noise risks of continuous push.

### 5. Add Dynamic Code Instrumentation

The research's Pattern B (Cursor Debug Mode) involves the agent injecting `console.log` statements into running code. ViewGraph should **not** do this because:
- ViewGraph's README explicitly states: "It never injects into or manipulates the running application directly"
- Code instrumentation is the domain of the IDE/agent itself (Cursor already does this)
- Injecting code via a browser extension raises security concerns (XSS vector)
- ViewGraph's value is observation, not mutation

**Instead**: ViewGraph provides the observational data that helps the agent decide where to add its own instrumentation via normal code editing.

### 6. Build a Full Telemetry Pipeline

The research's Pattern C (Telemetry-as-Prompt) describes a five-stage pipeline (Ingest → Sanitize → Correlate → Summarize → Prompt Build) with W3C Trace Context, OpenTelemetry integration, and structured log schemas. ViewGraph should **not** build this because:
- This is an enterprise observability concern, not a dev-time UI review tool
- It requires application code changes (structured logging, trace context propagation)
- ViewGraph works with any app "regardless of backend technology" - requiring telemetry instrumentation breaks this
- The complexity is disproportionate to ViewGraph's user base (individual developers and small teams)

**Instead**: ViewGraph can consume the output of such systems (if errors appear in the browser console or network responses) without needing to be part of the telemetry pipeline itself.

---

## F. SYNTHESIS: ViewGraph's Role in the Runtime Feedback Ecosystem

The research describes a complete runtime feedback system. ViewGraph is not that system - but it's a critical piece of it.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPLETE RUNTIME FEEDBACK ECOSYSTEM               │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  ViewGraph        │  │  Runtime Feedback │  │  IDE/Agent       │  │
│  │  (UI Context)     │  │  (Backend Logs)   │  │  (Code Edit)     │  │
│  │                   │  │                   │  │                   │  │
│  │  • DOM state      │  │  • Server stderr  │  │  • Instrumentation│ │
│  │  • Console errors │  │  • Docker logs    │  │  • Hypothesis     │  │
│  │  • Network fails  │  │  • Build errors   │  │  • Code changes   │  │
│  │  • A11y state     │  │  • DB errors      │  │  • Test generation│  │
│  │  • Layout state   │  │  • Crash dumps    │  │                   │  │
│  │  • Annotations    │  │                   │  │                   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                      │                      │            │
│           └──────────────────────┼──────────────────────┘            │
│                                  │                                    │
│                          ┌───────▼───────┐                           │
│                          │   AI Agent    │                           │
│                          │  (via MCP)    │                           │
│                          └───────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

**ViewGraph's lane**: Frontend runtime state captured as structured snapshots, enriched with console/network/a11y data, exposed via MCP. Enhanced with error buffering, watch mode, and error-triggered captures.

**Runtime Feedback tool's lane**: Backend process monitoring, continuous error streaming, build error capture, cross-service correlation. A separate MCP server.

**IDE/Agent's lane**: Code editing, instrumentation injection, hypothesis testing, test generation.

These three tools complement each other. ViewGraph should stay in its lane but make that lane deeper - richer error context, smarter capture triggers, better "what changed?" queries. The research validates ViewGraph's architecture and points to specific enhancements (Opportunities 1-3, 6-7) that make ViewGraph's existing model more powerful without changing its identity.

---

## G. IMMEDIATE ACTION ITEMS

1. **This week**: Implement Opportunity 6 (error summaries in `get_page_summary`). Server-only, 1-2 days.
2. **Next week**: Implement Opportunity 1 (error buffer in collectors). Extension + server, 3-4 days.
3. **Week after**: Implement Opportunity 2 (`watch_for_errors` tool). Full-stack, 5-7 days.
4. **Backlog**: Opportunities 3, 7, 8 as follow-ups.
5. **Separate project**: Consider building the research's runtime feedback daemon as a companion MCP server (`@runtime-feedback/core`) that handles backend logs. It would coexist with ViewGraph - same agent, two MCP servers, complete coverage.
