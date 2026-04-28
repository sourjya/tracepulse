# Agentic Runtime Feedback Loop: Research & Architecture for Automated Dev-Time Debugging

**Author:** Sourjya  
**Date:** April 27, 2026  
**Status:** Research & Design Phase  
**Goal:** Design a tool/extension/plugin that enables agentic coding IDEs/CLIs (like Kiro) to dynamically fetch frontend and backend runtime/debug issues, diagnose errors, and fix them - eliminating the manual log-reading cycle.

---

## 1. Executive Summary

Modern agentic coding tools (Kiro, Cursor, Claude Code, Copilot) can write and refactor code at remarkable speed, but they are **blind to what happens after the code runs**. When a developer writes code and it fails at runtime - a React component throws an unhandled exception, an API returns a 500, a database query times out - the developer must manually:

1. Switch to the browser console or terminal
2. Read through logs to find the error
3. Copy-paste the error back into the agent
4. Wait for a fix
5. Repeat

This manual loop is the single biggest friction point in AI-assisted development. It breaks flow, loses context, and wastes time on mechanical work that should be automated.

This document presents a comprehensive research analysis of methodologies, existing tools, academic work, and architectural patterns for building a **runtime feedback loop** - a system that automatically captures runtime errors from both frontend (browser) and backend (server) environments, pipes them to the coding agent, and enables autonomous diagnosis and repair.

The recommended architecture is an **MCP-based bridge** with runtime collectors (Chrome DevTools Protocol for frontend, log tailing for backend), a normalization/buffering layer, and an MCP server that exposes structured runtime data as tools the agent can call. This can be built incrementally, starting with a high-ROI MVP (backend log capture) and graduating to proactive monitoring and dynamic instrumentation.

---

## 2. Problem Statement

### 2.1 The Broken Feedback Loop

The current developer workflow with AI coding agents looks like this:

```
Developer describes task
    → Agent writes code
    → Developer runs code
    → Something breaks
    → Developer reads logs (browser console, terminal, Docker logs)
    → Developer copy-pastes error to agent
    → Agent guesses a fix based on the pasted text
    → Developer runs again
    → Repeat until fixed
```

Problems with this loop:

- **Context loss**: By the time the developer pastes an error, the agent has lost the execution context. It doesn't know what happened before or after the error, what the HTTP request looked like, or what the server state was.
- **Manual labor**: The developer is doing mechanical work - reading logs, selecting relevant lines, formatting them for the agent. This is exactly the kind of work AI should handle.
- **Incomplete information**: Developers often paste only the error message, missing the stack trace, the network request that triggered it, the console warnings that preceded it, or the server-side logs that correlate with the client-side failure.
- **Slow iteration**: Each round-trip through this manual loop takes 1-5 minutes. For complex bugs involving both frontend and backend, it can take dozens of iterations.
- **No proactive detection**: The agent doesn't know something broke until the developer tells it. If the developer doesn't notice a console error or a silent network failure, it goes unaddressed.

### 2.2 What the Ideal State Looks Like

```
Developer describes task
    → Agent writes code
    → Code runs (hot reload / dev server)
    → Agent automatically sees runtime output
    → If errors: agent diagnoses, correlates frontend + backend, proposes fix
    → Developer approves (or agent auto-applies for low-risk fixes)
    → Agent verifies the fix by watching runtime again
    → Loop closes automatically
```

The developer's role shifts from **log reader and error courier** to **decision maker and approver**.

### 2.3 Scope

This research covers:
- **Frontend runtime**: Browser console errors, unhandled exceptions, network failures (4xx/5xx), React/Vue/Angular error boundaries, client-side crashes
- **Backend runtime**: Server logs (stdout/stderr), framework-specific errors (Express, Django, Spring Boot, etc.), database errors, unhandled exceptions, crash dumps
- **Build/compile errors**: TypeScript compiler errors, webpack/vite build failures, linting errors
- **Development environment only**: This is not about production observability. The target is the local dev loop - `npm run dev`, `python manage.py runserver`, `docker-compose up`.

---

## 3. Landscape of Existing Approaches

### 3.1 Production/Commercial Tools

#### Cursor Debug Mode (December 2025)

Cursor introduced "Debug Mode" as a fundamentally different agent loop built around runtime information and human verification. The workflow:

1. Developer describes the bug
2. Agent reads the codebase and generates **multiple hypotheses** about what could be wrong
3. Agent **instruments the code with logging statements** designed to test these hypotheses
4. Developer reproduces the bug while the agent collects runtime logs
5. Agent sees variable states, execution paths, timing information - pinpoints root cause
6. Agent generates a targeted fix (often 2-3 lines instead of hundreds of speculative lines)
7. Developer reproduces again to verify the fix
8. Agent removes all instrumentation, leaving a clean diff

**Key insight**: The agent doesn't just read existing logs - it *adds its own observability* to test specific hypotheses. The human-in-the-loop verification step is critical for correctness.

**Limitation**: Requires manual reproduction by the developer. The agent can't trigger the bug itself in most cases.

#### Chrome DevTools MCP (Google, September 2025)

Google's official MCP server that bridges AI coding assistants with live Chrome browser instances. It exposes the full Chrome DevTools Protocol (CDP) surface through MCP tools:

- Console log inspection (read runtime errors and warnings)
- Network request analysis (failed requests, CORS errors, slow API calls)
- DOM inspection and scripting
- User interaction simulation (navigate, click, fill forms)
- Screenshots and DOM snapshots
- Performance tracing (LCP, CLS, etc.)
- Environment emulation (slow network, CPU throttling, viewport sizes)

**Architecture**: Runs as a Node.js process locally, uses Puppeteer to control Chrome, wraps CDP behind named MCP tools (`navigate_page`, `list_console_messages`, `performance_start_trace`). Can launch its own Chrome session or connect to an existing instance via remote debugging.

**Key insight**: The bridge pattern - MCP wraps CDP, any MCP-compatible agent can use it. No custom integration needed per-agent.

#### BrowserTools MCP (AgentDeskAI, 7.2k GitHub stars)

A three-component system for capturing browser data and exposing it to AI agents:

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌─────────────┐
│  MCP Client │ ──► │  MCP Server  │ ──► │  Node Server  │ ──► │   Chrome    │
│  (e.g.      │ ◄── │  (Protocol   │ ◄── │ (Middleware)  │ ◄── │  Extension  │
│   Cursor)   │     │   Handler)   │     │               │     │             │
└─────────────┘     └──────────────┘     └───────────────┘     └─────────────┘
```

1. **Chrome Extension**: Monitors XHR requests/responses, console logs, tracks selected DOM elements, captures screenshots via WebSocket
2. **Node Server (Middleware)**: Receives logs from extension, processes requests from MCP server, intelligently truncates strings to avoid token limits, removes cookies and sensitive headers
3. **MCP Server**: Implements Model Context Protocol, provides standardized tools for AI clients

Also includes Lighthouse-based auditing (accessibility, performance, SEO, best practices).

**Key insight**: The three-tier architecture (extension captures → middleware buffers/filters/redacts → MCP exposes) is a clean separation of concerns. The middleware layer is critical for token management and security.

**Note**: This project is no longer actively maintained as of 2026, but the architecture remains a strong reference.

#### Lightrun Runtime Context (December 2025)

Lightrun launched an MCP-based solution that gives AI coding agents direct access to runtime behavior across staging, pre-production, and production environments. Key capabilities:

- AI agents can **trigger remote debugging sessions** in live environments
- **Dynamic instrumentation without redeployment**: Add logs, traces, snapshots to running code on-the-fly
- Sandboxed instrumentation that runs outside application execution paths (no thread pauses, no performance impact)
- Propose fixes based on actual runtime behavior
- Access production-grade telemetry in real time

**Architecture**: Proprietary agent installed in the runtime environment, IDE plugin, and MCP server as the bridge. The agent can inject observability into running JVM/.NET/Node.js processes without restarting them.

**Key insight**: Dynamic instrumentation without redeploy is extremely powerful. The agent doesn't need to modify source code to add logging - it injects it at the bytecode/runtime level. This is the most advanced approach but requires deep runtime integration.

#### Abnormal AI's Claude Code Feedback Loop (November 2025)

Built by Shrivu Shankar at Abnormal AI to address a hidden problem: AI agents generate code but don't "complain" when they hit errors in CI environments. The system:

1. Processes thousands of logs from every Claude Code run in CI
2. Pipes them into an LLM for analysis
3. Surfaces recurring problems (agents misinterpreting commands, assuming local environment in CI)
4. Provides actionable feedback
5. Automates fixes by sending summarized issues back into Claude/Cursor

**Key insight**: Treats the agent's own failures as a learning signal. Acts as a "manager for the swarm of agents" - monitoring what's breaking and feeding improvements back. Every run strengthens the next.

#### Other Notable Tools

- **Helix (Self-Healing Systems)**: Crash hits Sentry → Helix diagnoses → writes a failing test → generates a fix → opens a PR. Fully autonomous but requires human approval before merge.
- **Sonarly**: AI agent that deduplicates alerts and fixes bugs with optimized context of production systems (codebase, logs, metrics, traces).
- **Struct**: AI agent that root-causes engineering alerts using logs, metrics, traces, and code.
- **TraceRoot.AI**: Open-source AI-native observability connecting logs, traces, metrics, code, and team discussions.
- **VibeFix Error Reporter**: Chrome extension that captures JS errors, unhandled promise rejections, console errors, network failures on vibe coding platforms (Bolt, Lovable, Cursor, Replit).

### 3.2 Academic Research

#### InspectCoder (2025, arxiv 2510.18327)

The first agentic program repair system that empowers LLMs to actively conduct dynamic analysis via interactive debugger control. Uses a **dual-agent framework**:

- **Program Inspector**: Manages breakpoints, targeted state inspection, and incremental runtime experimentation within stateful debugger sessions
- **Patch Coder**: Synthesizes verified repairs based on the runtime information gathered by the Inspector

The system enables strategic breakpoint placement and targeted state inspection - the agent doesn't just read logs, it actively controls a debugger to examine specific variables and execution paths.

**Key insight**: Separating the "investigation" agent from the "repair" agent improves both accuracy and reliability. The investigator gathers evidence; the repairer uses that evidence.

#### UniDebugger (EMNLP 2025)

A hierarchical multi-agent framework for unified software debugging. Decomposes the debugging process into specialized sub-tasks handled by different agents:

- Fault localization agent
- Root cause analysis agent
- Patch generation agent

Each agent is specialized and the hierarchy coordinates them. This mirrors how experienced human debuggers work - first find where, then understand why, then fix.

#### Trace-Driven Multi-Agent Debugging (2025, arxiv 2602.06875)

Instruments code with diagnostic probes to capture fine-grained runtime traces, then conducts causal analysis on these traces to identify root cause. The framework:

1. First instruments the code with diagnostic probes
2. Captures fine-grained runtime traces
3. Conducts causal analysis to accurately identify root cause

**Key insight**: Causal analysis on traces (not just pattern matching on error messages) is significantly more accurate for complex bugs involving multiple components.

#### Multi-Agent Collaboration + Runtime Debugging (2025, arxiv 2505.02133)

Systematic evaluation combining multi-agent collaboration with runtime execution information for improved code generation. Findings:

- Combining agents with different detection patterns finds more bugs than any single agent
- Agent correlation measured at ρ = 0.05–0.25, meaning agents look for genuinely different problems
- Runtime information dramatically improves repair accuracy over static analysis alone

### 3.3 Key Methodology: Telemetry-as-Prompt (DebuggAI)

A comprehensive methodology for designing observability that doubles as AI-friendly input. Core principles:

1. **Structured events over free-text logs**: JSON Lines or protobuf, not `console.log("something broke")`
2. **Trace context everywhere**: W3C Trace Context (`traceparent` header) propagated across HTTP, gRPC, queues, serverless
3. **Redaction at source**: Allowlist fields, hash identifiers, scan for secrets - before logs leave the process
4. **Error fingerprints**: Stable hash of (error_code + normalized_message + top_stack_frame) for deduplication and retrieval
5. **Metrics as gates**: Only trigger AI triage when error_rate exceeds baseline + threshold
6. **Deterministic prompt assembly**: Given an incident ID, reconstruct exactly what the AI saw
7. **Token budgeting**: Cap prompt size, prefer highest-signal events, use structure-aware compression
8. **Feedback loops**: Collect ground truth from fixes, measure AI diagnostic accuracy, iterate

The five-stage pipeline: **Ingest → Sanitize/Redact → Correlate → Summarize/Prioritize → Prompt Build/Retrieve**

**Key insight**: If you design telemetry for AI consumption from the start, the debugging agent becomes dramatically more accurate. Telemetry is not something you read after the fact - it's the runtime prompt that guides the AI.


---

## 4. Architectural Patterns

Four distinct architectural patterns emerge from the research. They are not mutually exclusive - a production system would combine elements of all four.

### 4.1 Pattern A: The MCP Bridge (Foundation Pattern)

**Summary**: A middleware daemon connects to runtime targets, normalizes events, and exposes them via an MCP server that any coding agent can call.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Kiro / CLI  │◄───►│  MCP Server  │◄───►│  Middleware   │◄───►│  Runtime     │
│  Agent       │     │  (your tool) │     │  (collector)  │     │  Targets     │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                  ├─ Browser (CDP)
                                                                  ├─ Backend (log tail)
                                                                  ├─ Dev server (stderr)
                                                                  └─ Docker containers
```

**How it works:**

1. A **middleware daemon** connects to runtime targets:
   - Browser via CDP (Chrome DevTools Protocol) WebSocket
   - Backend via log file tailing or structured log stream
   - Dev server stderr capture
   - Docker container log streams
2. It **buffers, deduplicates, redacts secrets**, and structures events into a normalized format
3. An **MCP server** exposes tools like `get_console_errors`, `get_network_failures`, `get_server_logs`, `get_recent_errors` that the agent can call on demand
4. The agent calls these tools when it needs runtime context - either after making a code change or when investigating a reported issue

**Strengths:**
- Works with any MCP-compatible agent (Kiro, Cursor, Claude Code, Copilot, etc.)
- Clean separation of concerns (collection vs. exposure vs. consumption)
- Agent controls when and how much context it consumes (pull-based)
- No modification to the application code required
- Incrementally buildable - start with one collector, add more over time

**Weaknesses:**
- Agent must know to ask for runtime data (doesn't get pushed automatically)
- Requires the developer to have the middleware running alongside their dev server
- CDP connection requires Chrome to be launched with `--remote-debugging-port` or the middleware to manage the browser lifecycle

**When to use**: This is the **foundation pattern**. Build this first. Everything else layers on top.

**Reference implementations**: Chrome DevTools MCP, BrowserTools MCP, Microsoft App Service Observability MCP Server.

### 4.2 Pattern B: Observe-Hypothesize-Instrument-Verify Loop (Cursor Debug Mode Pattern)

**Summary**: The agent doesn't just passively read logs - it actively instruments the code with targeted logging to test specific hypotheses, then reads the results.

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT LOOP                                │
│                                                              │
│  1. Read code + existing error context                       │
│  2. Generate N hypotheses about root cause                   │
│  3. For each hypothesis:                                     │
│     a. Instrument code with targeted logging/assertions      │
│     b. Trigger reproduction (or ask developer to reproduce)  │
│     c. Collect runtime data from instrumentation             │
│     d. Evaluate: does data confirm or refute hypothesis?     │
│  4. Identify most likely root cause from confirmed data      │
│  5. Generate minimal fix                                     │
│  6. Verify fix (re-run, check no errors)                     │
│  7. Remove all instrumentation, leave clean diff             │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**

1. Developer describes a bug or the agent detects an error via Pattern A
2. Agent reads the relevant codebase and generates **multiple hypotheses** (not just one guess)
3. Agent **instruments the code** with logging statements designed to test each hypothesis:
   - Add `console.log` with specific variable values at suspected failure points
   - Add timing measurements around suspected slow operations
   - Add assertions that will fail loudly if a hypothesis is correct
4. Developer reproduces the bug (or the agent triggers it via automated test / browser automation)
5. Agent **reads the instrumentation output** - now it has concrete data about variable states, execution paths, timing
6. Agent identifies root cause based on evidence, generates a **targeted fix** (typically 2-3 lines, not hundreds of speculative lines)
7. Verification step: reproduce again with the fix in place
8. Agent **removes all instrumentation**, leaving only the clean fix

**Strengths:**
- Dramatically more accurate than guessing from error messages alone
- Produces minimal, targeted fixes instead of speculative rewrites
- The hypothesis-testing approach mirrors how expert human debuggers work
- Works for complex bugs that aren't obvious from logs alone

**Weaknesses:**
- Requires reproduction of the bug (manual or automated)
- Multiple instrument-reproduce-read cycles can be slow
- Instrumentation injection requires careful handling to avoid breaking the app
- Cleanup must be thorough - leftover `console.log` statements are a code smell

**When to use**: For **hard bugs** where the error message alone isn't sufficient to diagnose the root cause. Especially valuable for state-related bugs, race conditions, and issues involving multiple components.

**Reference implementations**: Cursor Debug Mode, InspectCoder (academic).

### 4.3 Pattern C: Telemetry-as-Prompt (Structured Observability Pattern)

**Summary**: Design the application's logging and tracing as first-class input to the AI from the start. The telemetry IS the prompt.

```
┌─────────────────────────────────────────────────────────────┐
│                APPLICATION CODE                              │
│                                                              │
│  Structured JSON logs with stable schema                     │
│  W3C Trace Context (traceparent) on every request            │
│  Error fingerprints (hash of code + message + frame)         │
│  Redaction at source (secrets never leave the process)       │
│  Severity levels with semantic meaning                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              TELEMETRY PIPELINE                               │
│                                                              │
│  1. Ingest: structured events via collectors                 │
│  2. Sanitize: allowlisted fields, typed validation           │
│  3. Correlate: join logs + spans + metrics by trace_id       │
│  4. Summarize: score by diagnostic value, compress           │
│  5. Prompt Build: deterministic, bounded, safe               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              AI DEBUGGING AGENT                               │
│                                                              │
│  Receives structured context, not raw log dump               │
│  Can correlate frontend request with backend trace           │
│  Uses error fingerprints to find similar past incidents       │
│  Token-budgeted: gets high-signal events, not everything     │
└─────────────────────────────────────────────────────────────┘
```

**Core instrumentation patterns:**

1. **Structured logs with stable schema**: JSON Lines, not free-text. Fields: `trace_id`, `span_id`, `service`, `version`, `env`, `level`, `error_code`, `message`, `fingerprint`
2. **Trace context everywhere**: W3C `traceparent` header propagated across HTTP, gRPC, queues. Every event carries `trace_id` and `span_id`
3. **Redaction at source**: Allowlist over blocklist. Deterministic hashing for identifiers. Secret scanning with immediate drop/replace. PII tagging in code with logger enforcement
4. **Error fingerprints**: Stable hash of `(error_code, normalized_message, file:line)`. Used as dedup key and retrieval key for past incidents
5. **Metrics as gates**: Only trigger AI triage when `error_rate > baseline * threshold`. Cap prompt size and model selection based on severity
6. **Deterministic prompt assembly**: Given a `trace_id`, the same prompt is built every time. Structured JSON sections so the model can parse reliably

**Strengths:**
- Highest accuracy - the AI gets exactly the information it needs in a parseable format
- Enables correlation across services (frontend request → backend trace → database query)
- Error fingerprints enable learning from past fixes
- Deterministic and reproducible - you can replay any diagnosis
- Scales to complex microservice architectures

**Weaknesses:**
- Requires upfront investment in instrumentation quality
- Existing codebases need retrofitting
- Overhead of maintaining telemetry schemas
- Overkill for simple single-service dev setups

**When to use**: For **teams and projects that want the highest-quality debugging AI**. Best adopted incrementally - start with structured logs and error fingerprints, add trace context and correlation over time.

**Reference**: DebuggAI's "Telemetry as Prompt" methodology, OpenTelemetry, W3C Trace Context.

### 4.4 Pattern D: Continuous Watch Mode (The Dev Companion)

**Summary**: Instead of the developer asking the agent to debug, the agent proactively monitors runtime output and surfaces issues as they happen.

```
┌─────────────────────────────────────────────────────────────┐
│              CONTINUOUS WATCH DAEMON                          │
│                                                              │
│  Watches all runtime sources continuously:                   │
│  - Browser console (via CDP subscription)                    │
│  - Server stdout/stderr (via process pipe)                   │
│  - Build tool output (via file watch)                        │
│  - Docker container logs (via Docker API)                    │
│                                                              │
│  On new error (fingerprint not seen before):                 │
│  1. Capture error + surrounding context (±5 seconds)         │
│  2. Correlate with recent code changes (git diff)            │
│  3. Correlate frontend error with backend logs (by time)     │
│  4. Package into structured diagnostic context               │
│  5. Push notification to agent                               │
│  6. Agent reads relevant code, proposes fix                  │
│  7. Developer approves or dismisses                          │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**

1. A background daemon subscribes to all runtime event sources
2. Events are fingerprinted and deduplicated in real-time
3. When a **new, unique error** is detected (fingerprint not in the seen-set):
   - Capture the error plus surrounding context (logs from ±5 seconds)
   - Correlate with the most recent `git diff` to identify likely causal code change
   - If both frontend and backend errors occurred in the same time window, correlate them
   - Package everything into a structured diagnostic payload
4. Push a notification/event into the agent's context
5. Agent autonomously reads the relevant code, diagnoses, and proposes a fix
6. Developer sees the proposed fix and approves, modifies, or dismisses

**Strengths:**
- Zero manual effort from the developer - errors are caught and diagnosed automatically
- Catches errors the developer might not notice (silent network failures, console warnings)
- Correlation with `git diff` helps identify which recent change caused the error
- Feels like having a pair programmer who's always watching the runtime

**Weaknesses:**
- Risk of noise - too many notifications can be distracting
- Requires sophisticated filtering to avoid false positives
- Push-based model means the agent might interrupt the developer at bad times
- Harder to implement correctly than pull-based patterns
- Needs careful UX design for the notification/approval flow

**When to use**: As the **final evolution** of the tool, after Patterns A and B are solid. This is the most ambitious pattern and the closest to the original vision of "dev and get feedback with ease."

**Noise mitigation strategies:**
- Only surface errors with new fingerprints (not repeats)
- Require error to persist across 2+ occurrences before surfacing
- Respect "focus mode" - batch notifications instead of interrupting
- Let the developer configure severity thresholds
- Correlate with recent code changes - only surface errors likely caused by the developer's current work


---

## 5. Concrete Architecture for the Tool

This section describes the recommended architecture in implementation detail. The system is organized into four layers.

### 5.1 Layer 1: Runtime Collectors (Data Sources)

#### 5.1.1 Frontend - Browser (Chrome DevTools Protocol)

Connect to Chrome via CDP WebSocket. Chrome must be launched with `--remote-debugging-port=9222` or the tool manages the browser lifecycle.

**Events to subscribe to:**

| CDP Domain | Event | What it captures |
|---|---|---|
| `Runtime` | `consoleAPICalled` | All `console.log/warn/error/info` calls |
| `Runtime` | `exceptionThrown` | Unhandled JS exceptions with stack traces |
| `Network` | `responseReceived` | HTTP responses - filter for 4xx/5xx status codes |
| `Network` | `loadingFailed` | Failed network requests (DNS, CORS, timeout) |
| `Network` | `requestWillBeSent` | Request details (URL, method, headers) for correlation |
| `Log` | `entryAdded` | Browser-level log entries (security warnings, deprecations) |
| `Page` | `javascriptDialogOpening` | Alert/confirm/prompt dialogs (often indicate errors) |

**Implementation approach:**

```javascript
// Conceptual - connect to Chrome CDP and subscribe to error events
const CDP = require('chrome-remote-interface');

async function connectBrowser() {
  const client = await CDP({ port: 9222 });
  const { Runtime, Network, Log, Page } = client;

  await Runtime.enable();
  await Network.enable();
  await Log.enable();

  Runtime.on('exceptionThrown', (params) => {
    emit(normalizeException(params));
  });

  Runtime.on('consoleAPICalled', (params) => {
    if (params.type === 'error' || params.type === 'warning') {
      emit(normalizeConsole(params));
    }
  });

  Network.on('responseReceived', (params) => {
    if (params.response.status >= 400) {
      emit(normalizeNetworkError(params));
    }
  });

  Network.on('loadingFailed', (params) => {
    emit(normalizeNetworkFailure(params));
  });
}
```

**Optional capabilities:**
- `Page.captureScreenshot` - capture visual state on error
- `DOM.getDocument` + `DOM.querySelector` - inspect DOM state
- `Performance.getMetrics` - runtime performance data

#### 5.1.2 Backend - Server Logs

Multiple strategies depending on the dev setup:

**Strategy 1: Process stderr/stdout capture (recommended for dev servers)**

Spawn the dev server as a child process and capture its output streams directly:

```javascript
const { spawn } = require('child_process');

function startDevServer(command, args) {
  const proc = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'] });

  proc.stdout.on('data', (chunk) => {
    parseAndEmit(chunk.toString(), 'server-stdout');
  });

  proc.stderr.on('data', (chunk) => {
    parseAndEmit(chunk.toString(), 'server-stderr');
  });
}
```

**Strategy 2: Log file tailing (for apps that write to files)**

```javascript
const chokidar = require('chokidar');
const readline = require('readline');

function tailLogFile(path) {
  // Watch for changes, read new lines from the end
  let lastSize = 0;
  chokidar.watch(path).on('change', () => {
    // Read from lastSize to current size
    // Parse each new line
  });
}
```

**Strategy 3: Docker container logs**

```bash
docker logs -f --since=1m <container_name> 2>&1
```

Pipe through the same parser as Strategy 1.

**Strategy 4: Structured log stream (if app outputs JSON)**

If the application outputs structured JSON logs (e.g., via `pino`, `structlog`, `logback` with JSON encoder), parse them directly - no regex needed:

```javascript
function parseStructuredLog(line) {
  try {
    const entry = JSON.parse(line);
    return {
      level: entry.level || 'info',
      message: entry.msg || entry.message,
      timestamp: entry.time || entry.timestamp,
      error_code: entry.error_code,
      stack_trace: entry.stack || entry.err?.stack,
      // ... other fields
    };
  } catch {
    return parseUnstructuredLog(line); // fallback to regex
  }
}
```

**Error pattern parsers for common frameworks:**

| Framework | Error Pattern |
|---|---|
| Node.js / Express | Stack traces starting with `Error:` or `TypeError:`, `UnhandledPromiseRejection` |
| Python / Django / Flask | Tracebacks starting with `Traceback (most recent call last):` |
| Java / Spring Boot | Stack traces starting with exception class names, `at com.example...` |
| Go | `panic:` and `goroutine` stack dumps |
| Ruby / Rails | `RuntimeError`, `NoMethodError`, lines with `app/` paths |
| Rust | `thread 'main' panicked at` |

#### 5.1.3 Build/Compile Errors

Watch the build tool's output for compilation errors:

- **TypeScript**: Parse `tsc` output for `error TS####:` patterns
- **Webpack/Vite**: Parse for `ERROR in` or `[vite]` error blocks
- **ESLint**: Parse for file:line:col error/warning format
- **General**: Watch for non-zero exit codes from build processes

### 5.2 Layer 2: Event Normalization & Buffering

All events from all collectors are normalized into a single schema:

```typescript
interface RuntimeEvent {
  id: string;                    // UUID
  timestamp: number;             // Unix ms
  source: 'browser-console'
        | 'browser-network'
        | 'browser-exception'
        | 'server-log'
        | 'server-stderr'
        | 'build-error';
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;               // Normalized, truncated to 500 chars
  stack_trace?: string;          // Truncated to top 15 frames
  fingerprint: string;           // Dedup key (see below)
  context: {
    url?: string;                // Browser URL or API endpoint
    method?: string;             // HTTP method
    status_code?: number;        // HTTP status
    file?: string;               // Source file if known
    line?: number;               // Line number
    column?: number;             // Column number
    service?: string;            // Which process/container
    request_id?: string;         // For correlation
  };
  raw?: string;                  // Original log line, truncated to 1000 chars
  first_seen: number;            // When this fingerprint was first seen
  occurrence_count: number;      // How many times this fingerprint has occurred
}
```

**Fingerprinting algorithm:**

```typescript
function fingerprint(event: RuntimeEvent): string {
  const normalized = [
    event.source,
    event.level,
    normalizeMessage(event.message),  // strip variable parts like IDs, timestamps
    event.context.file || '',
    event.context.line?.toString() || '',
  ].join('|');

  return sha256(normalized).substring(0, 16);
}

function normalizeMessage(msg: string): string {
  return msg
    .replace(/0x[0-9a-f]+/gi, '<HEX>')       // hex addresses
    .replace(/\b\d{4,}\b/g, '<NUM>')          // long numbers
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-/g, '<UUID>') // UUIDs
    .replace(/:\d+:\d+/g, ':<L>:<C>')         // line:col
    .trim()
    .substring(0, 256)
    .toLowerCase();
}
```

**Ring buffer:**

```typescript
class EventBuffer {
  private events: RuntimeEvent[] = [];
  private fingerprints: Map<string, { count: number; firstSeen: number }> = new Map();
  private maxSize = 500;

  add(event: RuntimeEvent): void {
    const fp = this.fingerprints.get(event.fingerprint);
    if (fp) {
      fp.count++;
      event.occurrence_count = fp.count;
      event.first_seen = fp.firstSeen;
      // Don't add duplicate to buffer, just update count
      return;
    }

    this.fingerprints.set(event.fingerprint, {
      count: 1,
      firstSeen: event.timestamp,
    });
    event.occurrence_count = 1;
    event.first_seen = event.timestamp;

    this.events.push(event);
    if (this.events.length > this.maxSize) {
      const removed = this.events.shift()!;
      this.fingerprints.delete(removed.fingerprint);
    }
  }

  getErrors(since?: number, source?: string, limit = 20): RuntimeEvent[] {
    return this.events
      .filter(e => e.level === 'error' || e.level === 'warn')
      .filter(e => !since || e.timestamp >= since)
      .filter(e => !source || e.source === source)
      .slice(-limit);
  }
}
```

**Secret redaction:**

```typescript
const SECRET_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|auth)\s*[:=]\s*['"]?([^\s'"]+)/gi,
  /(?:Bearer\s+)([A-Za-z0-9\-_.]+)/g,
  /AKIA[0-9A-Z]{16}/g,                    // AWS access key
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g,  // GitHub tokens
  /sk-[A-Za-z0-9]{32,}/g,                 // OpenAI keys
];

function redact(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}
```

### 5.3 Layer 3: MCP Server (Agent Interface)

The MCP server exposes the following tools to the coding agent:

#### Tool: `get_errors`

```
get_errors(since?: timestamp, source?: string, limit?: number) → RuntimeEvent[]
```

Returns recent errors and warnings. The primary tool the agent uses after making a code change.

**Example agent workflow:**
1. Agent edits a file
2. Agent calls `get_errors(since=<time_of_edit>, limit=10)`
3. If errors returned → agent reads them, correlates with its change, fixes
4. If no errors → agent proceeds to next task

#### Tool: `get_network_failures`

```
get_network_failures(since?: timestamp, limit?: number) → RuntimeEvent[]
```

Returns failed HTTP requests (4xx, 5xx, timeouts, CORS errors). Includes URL, method, status code, and response body snippet.

#### Tool: `get_console_logs`

```
get_console_logs(level?: string, since?: timestamp, limit?: number) → RuntimeEvent[]
```

Returns browser console output. Filterable by level.

#### Tool: `get_server_logs`

```
get_server_logs(level?: string, since?: timestamp, limit?: number) → RuntimeEvent[]
```

Returns backend server logs. Filterable by level.

#### Tool: `get_build_errors`

```
get_build_errors() → RuntimeEvent[]
```

Returns current build/compile errors. These are typically blocking - the app won't run until they're fixed.

#### Tool: `watch_for_errors`

```
watch_for_errors(duration_seconds: number, source?: string) → RuntimeEvent[]
```

Starts a watch window. Returns all errors that occur within the specified duration. This is the key tool for the "edit → run → check" loop:

1. Agent makes a code change
2. Agent calls `watch_for_errors(15)` - "watch for 15 seconds"
3. Dev server hot-reloads, browser refreshes
4. Tool collects any errors during the window
5. Returns them to the agent

#### Tool: `get_error_context`

```
get_error_context(fingerprint: string) → { error: RuntimeEvent, surrounding_logs: RuntimeEvent[], occurrence_count: number }
```

Given an error fingerprint, returns the full error plus surrounding logs (±5 seconds) for deeper investigation.

#### Tool: `take_screenshot`

```
take_screenshot() → { base64_image: string, url: string, timestamp: number }
```

Captures the current browser state. Useful for visual bugs.

#### Tool: `clear_errors`

```
clear_errors() → { cleared_count: number }
```

Resets the error buffer. Useful after fixing a batch of errors to get a clean baseline.

#### Tool: `get_runtime_status`

```
get_runtime_status() → { browser_connected: boolean, server_connected: boolean, error_count: number, last_error_time: number }
```

Health check - tells the agent what runtime sources are available and the current error state.

### 5.4 Layer 4: Agent Workflow Integration

#### 5.4.1 Reactive Mode (Agent-Initiated)

The agent explicitly checks for runtime errors as part of its workflow:

```
Agent receives task: "Fix the login form"
  → Agent reads relevant code (login component, auth API)
  → Agent makes changes
  → Agent calls get_runtime_status() - confirms browser + server connected
  → Agent calls watch_for_errors(15)
  → [Dev server hot-reloads, browser refreshes]
  → watch_for_errors returns:
      - browser-exception: "TypeError: Cannot read property 'token' of undefined" at auth.js:42
      - browser-network: POST /api/login → 500 Internal Server Error
      - server-log: "Error: JWT_SECRET not defined in environment"
  → Agent correlates: the 500 caused the undefined token, root cause is missing env var
  → Agent fixes: adds fallback handling + documents the required env var
  → Agent calls watch_for_errors(10) again to verify
  → No errors returned
  → Done
```

#### 5.4.2 Proactive Mode (Event-Driven)

The tool pushes new errors to the agent context without being asked:

```
[Developer is working on feature X]
[Background: watch daemon detects new error]
  → New fingerprint: "Unhandled promise rejection: NetworkError" at api-client.js:87
  → Correlate with git diff: developer recently changed api-client.js
  → Package diagnostic context:
      Error: Unhandled promise rejection at api-client.js:87
      Recent change: Added new fetch call without .catch()
      Server log: No corresponding server error (client-side only)
  → Push to agent context as a notification
  → Agent proposes: "Add error handling to the new fetch call at api-client.js:87"
  → Developer sees notification, approves fix
```

#### 5.4.3 Hybrid Mode (Recommended)

Combine both:
- **Reactive** for the agent's own workflow (edit → check → fix cycle)
- **Proactive** for errors the developer might not notice (background failures, warnings that escalate)
- Developer can configure the proactive threshold (errors only, errors + warnings, everything)


---

## 6. Implementation Roadmap

### Phase 1: MVP - Backend Log Capture + MCP Server (Week 1-2)

**Goal**: Agent can read dev server errors without the developer copy-pasting.

**Deliverables:**
- Node.js daemon that spawns/attaches to a dev server process and captures stdout/stderr
- Error pattern parsers for Node.js stack traces and Python tracebacks
- Event normalization into `RuntimeEvent` schema
- Ring buffer with fingerprint-based deduplication
- Secret redaction
- MCP server exposing `get_errors`, `get_server_logs`, `clear_errors`, `get_runtime_status`
- Configuration file for specifying the dev server command and log patterns

**Why start here**: Backend log reading is the single most common manual task in the debug loop. Highest ROI for effort invested. No browser integration complexity.

**Validation**: Developer starts dev server via the tool, makes a breaking change, agent calls `get_errors` and sees the stack trace without any manual copy-paste.

### Phase 2: Browser Integration via CDP (Week 3-4)

**Goal**: Agent can see browser console errors and network failures.

**Deliverables:**
- CDP connector that attaches to Chrome on `localhost:9222`
- Subscriptions to `Runtime.exceptionThrown`, `Runtime.consoleAPICalled`, `Network.responseReceived`, `Network.loadingFailed`
- Browser event normalization into the same `RuntimeEvent` schema
- MCP tools: `get_console_logs`, `get_network_failures`, `take_screenshot`
- Auto-detection of Chrome debugging port
- Documentation for launching Chrome with `--remote-debugging-port`

**Validation**: Developer has a React app with a broken API call. Agent calls `get_network_failures` and sees the 500 response, calls `get_server_logs` and sees the corresponding backend error, correlates them, and fixes both sides.

### Phase 3: Watch Mode + Auto-Trigger (Week 5)

**Goal**: Agent can make a change and immediately check if it caused errors.

**Deliverables:**
- `watch_for_errors(duration_seconds)` tool implementation
- Time-windowed event collection with configurable duration
- Correlation of errors with timestamps (errors that occurred after the watch started)
- `get_error_context(fingerprint)` for deep-dive on specific errors

**Validation**: Agent edits a file, calls `watch_for_errors(10)`, dev server hot-reloads, tool captures any errors during the window and returns them. Agent uses this in a tight edit-check loop.

### Phase 4: Proactive Monitoring + Notifications (Week 6-7)

**Goal**: Agent is notified of new errors without having to poll.

**Deliverables:**
- Background watch daemon that continuously monitors all sources
- New-fingerprint detection (only surface errors not seen before)
- Correlation with `git diff` - identify if the error is likely caused by recent code changes
- Cross-source correlation (frontend error + backend error in same time window)
- Notification mechanism (MCP resource subscription or polling endpoint)
- Configurable severity thresholds and "focus mode" (batch notifications)

**Validation**: Developer makes a change that causes a new console error. Without being asked, the agent notices the error, reads the relevant code, and proposes a fix.

### Phase 5: Instrumentation Injection (Week 8-10)

**Goal**: Agent can add temporary logging to diagnose hard bugs (Cursor Debug Mode pattern).

**Deliverables:**
- AST-aware code instrumentation: agent can request adding `console.log` / `print` statements at specific locations
- Instrumentation tracking: remember what was added so it can be cleanly removed
- Hypothesis-driven workflow: agent generates hypotheses, instruments to test them, reads results
- Cleanup tool: remove all instrumentation after diagnosis
- Guard rails: limit number of instrumentation points, prevent instrumentation of production code

**Validation**: Developer reports a bug where a form submission silently fails. Agent generates 3 hypotheses, instruments the form handler and API client with targeted logging, developer reproduces, agent reads the logs, identifies that the request body is malformed due to a serialization bug, fixes it, removes instrumentation.

### Phase 6: Polish & Ecosystem (Week 11-12)

**Goal**: Production-quality tool ready for daily use.

**Deliverables:**
- Configuration UI/CLI for managing collectors, thresholds, and preferences
- Support for additional frameworks (Go, Java, Ruby, Rust error patterns)
- Docker Compose integration (auto-detect and tail container logs)
- Performance optimization (ensure the tool adds <5ms overhead to the dev loop)
- Comprehensive documentation and examples
- Package as installable MCP server (`npx @yourorg/runtime-feedback-mcp`)

---

## 7. Key Design Decisions

### 7.1 MCP vs. Custom Protocol

**Decision: Use MCP.**

MCP (Model Context Protocol) is the emerging standard for connecting AI agents to external tools. It's supported by Kiro, Cursor, Claude Code, Copilot, Cline, Windsurf, and others. Building on MCP means:
- Your tool works with any agent that supports MCP - build once, works everywhere
- You benefit from the ecosystem's tooling (MCP inspectors, registries, etc.)
- No need to build custom integrations per-IDE
- The protocol handles serialization, error handling, and tool discovery

The alternative - a custom WebSocket or HTTP protocol - would require building client integrations for each IDE/agent. Not worth it.

### 7.2 Browser Extension vs. CDP Direct

**Decision: Start with CDP direct. Add extension later only if needed.**

CDP direct (connecting to Chrome's debugging WebSocket):
- No extension installation required
- Works with headless Chrome
- Full access to all CDP domains
- Requires Chrome to be launched with `--remote-debugging-port`

Browser extension (like BrowserTools MCP):
- Works with any Chrome instance the user already has open
- No special launch flags needed
- Can capture from the user's actual browsing session
- Requires extension installation and maintenance
- More complex architecture (extension → middleware → MCP)

For a dev tool, CDP direct is simpler and sufficient. The developer is already running a dev server - asking them to launch Chrome with a flag is a small ask. An extension can be added later for users who want to capture from their regular browsing session.

### 7.3 Push vs. Pull

**Decision: Start with pull. Add push in Phase 4.**

Pull (agent calls `get_errors` when it wants):
- Simpler to implement
- Agent controls when it consumes context (no interruptions)
- No risk of overwhelming the agent with notifications
- Works within the standard MCP tool-call model

Push (tool notifies agent of new errors):
- Zero-effort for the developer - errors surface automatically
- Can catch errors the developer doesn't notice
- Risk of noise and interruption
- Requires more sophisticated filtering
- MCP's notification model is less mature than its tool-call model

Pull is the right starting point. The agent can incorporate `get_errors` calls into its workflow naturally. Push is the evolution for Phase 4 once the filtering and deduplication are battle-tested.

### 7.4 How Much Context to Send

**Decision: Less is more. Structured summaries with drill-down capability.**

Sending too much context wastes tokens and confuses the model. The strategy:

1. **Default response**: Top 5-10 unique errors, each with:
   - Source, level, message (truncated to 500 chars)
   - Stack trace (top 10 frames only)
   - Key context (URL, status code, file:line)
   - Occurrence count
2. **Drill-down**: Agent can call `get_error_context(fingerprint)` for full details on a specific error, including surrounding logs and all occurrences
3. **Hard caps**: Never return more than 50 events in a single response. Never include raw log lines longer than 1000 chars.
4. **Prioritization**: Errors before warnings. New fingerprints before repeats. Recent before old.

This mirrors how the Telemetry-as-Prompt methodology recommends token budgeting: high-signal events first, with the ability to request more detail on demand.

### 7.5 Structured Logs vs. Free-Text Parsing

**Decision: Support both. Prefer structured when available.**

Reality: most dev servers output free-text logs. You can't require every developer to switch to structured logging just to use your tool. The approach:

1. **Auto-detect**: If a log line is valid JSON, parse it as structured
2. **Framework parsers**: Regex-based parsers for common error patterns (Node.js stack traces, Python tracebacks, Java exceptions, etc.)
3. **Fallback**: If no parser matches, treat as free-text with basic level detection (lines containing "error", "Error", "ERROR" → error level; "warn" → warning; etc.)
4. **Normalize everything**: Regardless of input format, output the same `RuntimeEvent` schema

Over time, encourage adoption of structured logging by showing developers how much better the AI debugging experience is with structured data.

---

## 8. References & Further Reading

### 8.1 Tools & Products

| Resource | URL | Key Takeaway |
|---|---|---|
| Chrome DevTools MCP | https://github.com/ChromeDevTools/chrome-devtools-mcp | Reference implementation for browser-to-agent bridge via MCP |
| BrowserTools MCP | https://github.com/AgentDeskAI/browser-tools-mcp | Three-tier architecture (extension → middleware → MCP). Good patterns for log buffering and truncation |
| Cursor Debug Mode | https://cursor.com/blog/debug-mode | The hypothesize → instrument → reproduce → verify loop |
| Lightrun Runtime Context | https://lightrun.com/runtime-context/ | Dynamic instrumentation without redeploy, MCP-based |
| Helix Self-Healing | https://88hours.github.io/helix-community/ | Sentry crash → auto-diagnose → write failing test → generate fix → open PR |
| Sonarly | https://www.producthunt.com/products/sonarly | AI agent for deduplicating alerts and fixing bugs with production context |
| TraceRoot.AI | https://kelet.ai/ | Open-source AI-native observability |
| VibeFix Error Reporter | Chrome Web Store | Browser extension capturing JS errors for vibe coding platforms |

### 8.2 Methodologies & Articles

| Resource | URL | Key Takeaway |
|---|---|---|
| Telemetry as Prompt (DebuggAI) | https://debugg.ai/resources/telemetry-as-prompt-designing-runtime-signals-for-debug-ai | Comprehensive guide on designing logs/traces as AI input. Structured schemas, fingerprinting, redaction, prompt assembly |
| Claude Code Feedback Loop (Abnormal AI) | https://abnormal.ai/transform/productdevelopment/claude-code-feedback-loop | CI log → LLM analysis → systematic fix pattern. "Manager for the swarm of agents" |
| Coding Agents, Telemetry, and Self-Improving Software | https://futureagi.substack.com/p/closing-the-loop-coding-agents-telemetry | Overview of the telemetry-agent convergence trend |
| Autonomous Observability (IEEE) | https://www.computer.org/publications/tech-news/community-voices/autonomous-observability-ai-agents | AI agents that continuously consume, analyze, and act on telemetry |
| GoDaddy: AI Debugging Assistant in 72 Hours | https://www.godaddy.com/resources/news/building-an-ai-powered-debugging-assistant-in-72-hours | Practical case study of building a log-to-fix pipeline |

### 8.3 Academic Papers

| Paper | Source | Key Takeaway |
|---|---|---|
| InspectCoder: Dynamic Analysis-Enabled Self Repair | arxiv 2510.18327 | Dual-agent framework (Inspector + Patch Coder) using interactive debugger sessions |
| UniDebugger: Hierarchical Multi-Agent Debugging | EMNLP 2025 | Specialized agents for fault localization, root cause analysis, and patch generation |
| Trace-Driven Multi-Agent Debugging | arxiv 2602.06875 | Diagnostic probes → runtime traces → causal analysis for root cause identification |
| Multi-Agent Collaboration + Runtime Debugging | arxiv 2505.02133 | Combining agents with different detection patterns finds more bugs (ρ = 0.05–0.25) |
| Transforming Raw Execution Traces into Insights | arxiv 2603.05941 | XAI approach for structured, human-interpretable explanations from agent traces |
| Dynamic State-Guided Vulnerability Repair | arxiv 2504.07634 | Agent inspects actual program state via debugger, infers expected states, compares to find root causes |

### 8.4 Standards & Specifications

| Standard | URL | Relevance |
|---|---|---|
| Model Context Protocol (MCP) | https://modelcontextprotocol.io | The protocol for exposing tools to AI agents |
| Chrome DevTools Protocol (CDP) | https://chromedevtools.github.io/devtools-protocol/ | The protocol for programmatic browser control |
| W3C Trace Context | https://www.w3.org/TR/trace-context/ | Standard for distributed trace propagation |
| OpenTelemetry | https://opentelemetry.io | Vendor-neutral standard for traces, metrics, and logs |

---

## 9. Conclusion

The gap between "AI writes code" and "AI understands what the code does at runtime" is the single biggest bottleneck in agentic development workflows today. Every tool in this space - Cursor's Debug Mode, Google's Chrome DevTools MCP, Lightrun's Runtime Context, the academic work on InspectCoder and UniDebugger - is converging on the same insight: **the agent needs to see the runtime**.

The recommended path for building your automation tools:

1. **Start with the MCP Bridge pattern** (Pattern A) - a daemon that tails your dev server logs and connects to Chrome via CDP, normalizing everything into structured events exposed as MCP tools. This is the foundation that everything else builds on.

2. **Add watch mode** (Pattern A+) - the `watch_for_errors` tool that lets the agent make a change and immediately check for errors. This closes the basic feedback loop.

3. **Graduate to proactive monitoring** (Pattern D) - background daemon that pushes new errors to the agent. This is where the experience shifts from "agent helps when asked" to "agent catches problems you didn't notice."

4. **Layer in instrumentation injection** (Pattern B) - for hard bugs, let the agent add its own logging to test hypotheses. This is the most powerful capability but also the most complex.

5. **Over time, adopt telemetry-as-prompt practices** (Pattern C) - as your projects grow, structured logging with trace context and error fingerprints will make the AI dramatically more accurate.

The architecture is: **Collectors → Normalizer/Buffer → MCP Server → Agent**. Build it incrementally, validate each phase with real usage, and iterate. The goal is not to build a perfect system on day one - it's to eliminate the manual log-reading loop as fast as possible and then improve from there.

---

*End of research document.*
