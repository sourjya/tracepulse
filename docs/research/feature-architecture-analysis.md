# Runtime Feedback Tool: Feature & Architecture Analysis

**Date:** 2026-04-27
**Status:** Planning - Pre-Implementation Analysis
**Purpose:** Synthesize existing research, competitive landscape (April 2026), and gap analysis into actionable product decisions.

---

## 1. The Thesis (Validated)

AI coding agents are blind to what happens after code runs. The developer is a human clipboard - copying errors from terminals and browsers into the agent. This is the #1 bottleneck in agentic development workflows.

**Evidence (April 2026):**
- Lightrun's 2026 report: "Almost half of AI-generated code fails in production" - agents lack runtime visibility
- HUD.io (QCon London): "Before trying to make agents smarter, make sure they can actually see the system they're changing"
- Google's Chrome DevTools PM calls the current state "coding with blindfolds on"
- LangChain built a self-healing CI/CD flow specifically because agents can't see post-deploy behavior
- Every major tool (Cursor, Claude Code, Copilot) is adding runtime visibility features

The thesis from the research docs is not just valid - it's becoming consensus. The question is no longer "should we build this?" but "what specifically should we build that isn't already covered?"

---

## 2. Competitive Landscape (April 2026)

> **Full catalog:** See **Appendix B** for detailed profiles of 40+ tools across all categories with architecture, tech stack, and framework analysis.

### What EXISTS and is COVERED

| Category | Tool | What It Does | Maturity |
|---|---|---|---|
| **Step-through debugging** | mcp-debugger (debugmcp) | Full DAP-based debugging via MCP. Python, JS, Rust, Go, Java, .NET. | v0.20.0, 101★ |
| **Step-through debugging** | Microsoft DebugMCP | VS Code ext giving agents debugger control. 9 languages. | 316★ |
| **Step-through debugging** | claude-debugs-for-you | VS Code ext + MCP. Language-agnostic DAP. | 426★ |
| **Step-through debugging** | IDE Code Debug Bridge | VS Code/Cursor ext exposing full debugger as MCP tools | Active |
| **IDE diagnostics** | vscode-mcp (tjx666) | Real-time LSP diagnostics, type info, code navigation | Active |
| **IDE diagnostics** | Diagnostics MCP Server | VS Code diagnostics (TS, ESLint, Prettier) via HTTP MCP | Active |
| **Browser debugging** | Chrome DevTools MCP | Google's official CDP-to-MCP bridge. 29+ tools. | v0.21.0, official |
| **Browser debugging** | Frontman | Dev server middleware. DOM, CSS, routes, server logs. | Active |
| **Browser debugging** | Cursor Browser | Built-in: navigate, click, screenshot, read console. | Mature |
| **Browser debugging** | Replay.io | Time-travel debugging. Records deterministic sessions. MCP fix delivery. | Commercial |
| **Browser debugging** | Playwright MCP | Microsoft's official browser automation via MCP. | Official |
| **Error capture** | VibeFix / VibeCheck / Brie | Chrome exts capturing JS errors, console, network on vibe platforms | Active |
| **Instrumentation** | agentic-debugger | MCP server injecting temporary logging. JS/TS/Python. | Small |
| **Instrumentation** | claude-code-debug-mode | Hypothesis-driven debugging skill. #region DEBUG markers. | 70★ |
| **Production monitoring** | Sentry Seer | AI debugging agent + MCP server. Autofix PRs. | Commercial, Jan 2026 |
| **Production monitoring** | Datadog MCP Server | Live observability data to AI agents. | GA March 2026 |
| **Production monitoring** | Dynatrace MCP + Live Debugger | Code-level troubleshooting in any env. | GA |
| **Production monitoring** | HUD.io Runtime Code Sensor | Zero-config production context for agents. | Commercial |
| **Production monitoring** | Lightrun | Dynamic instrumentation without redeploy. MCP-based. | Commercial |
| **Production monitoring** | New Relic / Grafana / Elastic | Various MCP integrations for observability data | Commercial + OSS |
| **Container debugging** | ig-mcp-server (Inspektor Gadget) | Container/K8s debugging via eBPF + MCP | Active |
| **CI/CD feedback** | CircleCI MCP | Pull failure logs, identify test failures, propose fixes. | GA |
| **Self-healing** | Sonarly / TraceRoot.AI | Alert triage → root cause → auto-fix PRs | YC startups |
| **IDE agents** | Windsurf / Cline / Xcode 26.3 | Built-in debugging flows, terminal access, MCP integration | Various |

### What DOESN'T EXIST (The Gap)

**Nobody has built a standalone dev-time backend log monitoring MCP server.**

Specifically, no tool does:

1. **Dev server stdout/stderr → MCP** - Tail your `npm run dev` or `python manage.py runserver` output and expose errors as structured MCP tools. Zero config.
2. **Edit → hot-reload → error-check loop** - Agent makes a change, calls `watch_for_errors(15)`, gets back any new errors that appeared after hot reload. First-class workflow.
3. **Frontend-backend error correlation in dev** - Browser shows a 500 → what's the corresponding stack trace in the server terminal? Nobody connects these two in dev.
4. **Docker Compose log aggregation for dev** - Multi-service dev setup (API + DB + worker + frontend) - nobody tails all containers and exposes unified errors via MCP.
5. **Build error capture** - TypeScript compilation failures, Vite build errors, linting failures - not exposed via MCP for agent consumption.

The DAP debuggers (mcp-debugger, DebugMCP) are for **interactive step-through debugging** - setting breakpoints, inspecting variables. That's a different workflow from "what is my dev server doing right now?" Chrome DevTools MCP handles the browser side. Our tool handles the backend side.

---

## 3. Product Positioning

### What We Are

**A passive runtime observer for local development.** The tool that answers: "what is my dev server doing right now?"

```
┌─────────────────────────────────────────────────────────────────────┐
│                    THE AGENTIC DEBUGGING STACK                       │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Chrome DevTools  │  │  OUR TOOL        │  │  mcp-debugger /  │  │
│  │  MCP              │  │  (Runtime Watch)  │  │  DebugMCP        │  │
│  │                   │  │                   │  │                   │  │
│  │  Browser console  │  │  Server stdout    │  │  Breakpoints     │  │
│  │  Network requests │  │  Server stderr    │  │  Step-through    │  │
│  │  DOM state        │  │  Build errors     │  │  Variable inspect│  │
│  │  Screenshots      │  │  Docker logs      │  │  Stack traces    │  │
│  │  Performance      │  │  Error correlation│  │  Expression eval │  │
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

### What We Are NOT

- Not a step-through debugger (mcp-debugger/DebugMCP do this)
- Not a browser inspector (Chrome DevTools MCP does this)
- Not a production monitoring tool (HUD.io/Lightrun do this)
- Not a code instrumentation tool (agentic-debugger does this)
- Not a CI/CD pipeline monitor (LangChain self-healing does this)

### The Unique Value

**Zero-config, passive observation of your local dev environment, exposed as MCP tools.**

The developer runs their dev server normally. Our tool watches. The agent queries when it needs to. No browser extensions, no special flags, no code changes, no instrumentation injection.

HUD.io's three properties apply perfectly:
- **Zero config** - point it at your dev server command, it works
- **Complete** - stdout, stderr, build errors, all captured
- **Deep** - parsed into structured errors with stack traces, fingerprints, dedup

---

## 4. Feature Set (Prioritized)

### Phase 1: MVP - "What broke?" (Week 1-2)

The minimum viable product that delivers immediate value.

**Core capability:** Agent can see dev server errors without manual copy-paste.

| Feature | Description | Priority |
|---|---|---|
| **Process spawning** | Spawn dev server as child process, capture stdout/stderr | P0 |
| **Process attachment** | Attach to already-running process via log file tailing | P0 |
| **Error parsing** | Regex parsers for Node.js, Python, Go, Java, Rust stack traces | P0 |
| **Event normalization** | All errors → unified RuntimeEvent schema | P0 |
| **Fingerprinting** | Stable hash for dedup (source + normalized message + file:line) | P0 |
| **Ring buffer** | Bounded in-memory store (500 events max) | P0 |
| **Secret redaction** | Strip API keys, tokens, passwords from log output | P0 |
| **MCP tools** | `get_errors`, `get_server_logs`, `get_runtime_status`, `clear_errors` | P0 |

**MCP Tool Surface (Phase 1):**

```
get_errors(since?, source?, limit?) → RuntimeEvent[]
get_server_logs(level?, since?, limit?) → RuntimeEvent[]
get_runtime_status() → { connected: bool, error_count: int, last_error_time: int }
clear_errors() → { cleared_count: int }
```

**Validation:** Developer starts dev server via the tool, makes a breaking change, agent calls `get_errors` and sees the stack trace. No copy-paste.

### Phase 2: Watch Mode - "Did my fix work?" (Week 3-4)

The edit → verify loop that closes the feedback cycle.

| Feature | Description | Priority |
|---|---|---|
| **watch_for_errors** | Time-bounded error collection after agent makes a change | P0 |
| **Hot-reload detection** | Detect Vite/webpack/nodemon restart events in stdout | P1 |
| **Build error parsing** | TypeScript, ESLint, Vite/webpack compilation errors | P1 |
| **get_build_errors** | Dedicated tool for current build/compile errors | P1 |
| **get_error_context** | Deep-dive: full error + surrounding logs (±5 seconds) | P1 |

**MCP Tool Surface (Phase 2):**

```
watch_for_errors(duration_seconds, source?) → RuntimeEvent[]
get_build_errors() → RuntimeEvent[]
get_error_context(fingerprint) → { error, surrounding_logs, occurrence_count }
get_timeline(since, duration_seconds) → RuntimeEvent[]   // unified chronological stream of ALL events
```

**Validation:** Agent edits a file → calls `watch_for_errors(15)` → dev server hot-reloads → tool captures any errors during the window → returns them. Agent uses this in a tight edit-check loop.

### Phase 3: Multi-Process & Docker (Week 5-6)

Support real-world dev setups with multiple services.

| Feature | Description | Priority |
|---|---|---|
| **Multi-process** | Monitor multiple processes simultaneously (API + worker + frontend) | P1 |
| **Docker Compose** | Auto-detect and tail container logs from docker-compose.yml | P1 |
| **Service labeling** | Each error tagged with which service/container it came from | P1 |
| **Cross-service correlation** | Errors from different services in the same time window grouped | P2 |

**MCP Tool Surface (Phase 3):**

```
get_errors(since?, source?, service?, limit?) → RuntimeEvent[]  // extended with service filter
list_services() → { name, status, error_count, last_activity }[]
```

### Phase 4: Frontend-Backend Correlation (Week 7-8)

Bridge the gap between browser errors and server errors.

| Feature | Description | Priority |
|---|---|---|
| **Optional CDP connection** | Connect to Chrome for network failure data | P2 |
| **HTTP correlation** | Match browser 4xx/5xx with server stack traces by URL + timestamp | P2 |
| **get_correlated_errors** | Show both sides of a failed request | P2 |
| **ViewGraph integration** | If ViewGraph is running, pull its network failure data instead of CDP | P2 |

**MCP Tool Surface (Phase 4):**

```
get_correlated_errors(url?) → { frontend_error, backend_error, correlation_confidence }[]
```

### Phase 5: Proactive Monitoring (Week 9-10)

Shift from pull to push - agent gets notified of new errors.

| Feature | Description | Priority |
|---|---|---|
| **New-fingerprint detection** | Only surface errors not seen before | P2 |
| **Git diff correlation** | Link new errors to recent code changes | P2 |
| **Severity classification** | Auto-classify errors (crash vs warning vs info) | P2 |
| **MCP notifications** | Push new errors to agent context (when MCP supports it) | P3 |

### Explicitly Deferred

| Feature | Why Deferred |
|---|---|
| **Code instrumentation** | agentic-debugger already does this. Our value is passive observation. |
| **Step-through debugging** | mcp-debugger and DebugMCP own this space. Don't compete. |
| **Production monitoring** | HUD.io and Lightrun own this. We're dev-time only. |
| **Browser DOM inspection** | Chrome DevTools MCP and ViewGraph own this. |
| **Full telemetry pipeline** | Overkill for dev-time. OpenTelemetry exists for production. |

---

## 5. Architecture Decisions

### Decision 1: Language - TypeScript (Node.js)

**Rationale:**
- MCP SDK is TypeScript-first (`@modelcontextprotocol/sdk`)
- Process spawning and log tailing are native Node.js strengths
- CDP client libraries (Puppeteer) are JavaScript
- Docker API clients are well-supported in Node.js
- Distributable via `npx` - zero install for users
- Matches the ecosystem (Chrome DevTools MCP, mcp-debugger, agentic-debugger all TypeScript)

### Decision 2: Transport - stdio (primary), Streamable HTTP (secondary)

**Rationale:**
- stdio is the standard for local MCP servers spawned by agents
- Streamable HTTP enables multi-client scenarios (agent + dashboard)
- Start with stdio only. Add HTTP when multi-client is needed.

### Decision 3: Process Management - Spawn OR Attach

**Rationale:**
- **Spawn mode:** Tool starts the dev server as a child process, captures stdout/stderr directly. Simplest, most reliable. `devwatch start "npm run dev"`
- **Attach mode:** Tool tails a log file or connects to an already-running process. For developers who don't want to change how they start their server.
- Support both from day one. Spawn is the default, attach is the escape hatch.

### Decision 4: Error Parsing - Framework-Specific Regex + JSON Fallback

**Rationale:**
- Most dev servers output unstructured text. We need regex parsers.
- If a line is valid JSON (pino, structlog, logback JSON), parse it directly.
- Start with parsers for: Node.js, Python, Go, Java, Rust.
- Extensible: users can add custom patterns via config.

### Decision 5: No Browser Extension

**Rationale:**
- Chrome DevTools MCP already bridges the browser. We don't need to duplicate it.
- ViewGraph already has a browser extension for UI context.
- Our tool is backend-focused. Browser integration (Phase 4) uses CDP directly, not an extension.
- Fewer moving parts = easier adoption.

### Decision 6: Pull-First, Push Later

**Rationale:**
- Pull (agent calls `get_errors` when it wants) is simpler, more reliable, and gives the agent control.
- Push (tool notifies agent of new errors) risks noise and requires MCP notification support.
- Phase 1-4 are pull-only. Phase 5 adds push when the filtering is battle-tested.

### Decision 7: Salience-Scored Runtime Events (Inspired by ViewGraph + Clipboard Health)

**Rationale:**

Two proven systems solve the same fundamental problem - "how do you give an AI agent structured, token-efficient context for evidence-based decisions?" - at different layers:

- **ViewGraph's salience model** scores DOM elements (0-100) by diagnostic value and tiers them (high/medium/low). High-salience elements get full data; low-salience get structure only. This is an *input filter* - it controls what the agent sees.
- **Clipboard Health's confidence model** scores the agent's *diagnosis* (1-5) and gates action - confidence ≤2 means "don't propose a fix, gather more data." This is an *output gate* - it controls whether the agent acts.

These are complementary, not overlapping:

| Dimension | ViewGraph Salience | Clipboard Confidence | Our Tool |
|---|---|---|---|
| **What it scores** | DOM elements | Debugging diagnoses | Runtime events |
| **Who produces it** | Tool (automatic) | Agent (reasoning) | Tool (automatic) |
| **Direction** | Input filtering | Output gating | Input filtering + enabling output gating |
| **Purpose** | Token efficiency | Decision quality | Both |

**Our tool applies ViewGraph's salience model to runtime errors:**

Every `RuntimeEvent` gets a `signal_strength` field:

| Signal | Criteria | Data Included | Example |
|---|---|---|---|
| **high** (score ≥ 50) | Clear stack trace with file:line in user code, or unambiguous crash | Full message + stack trace + file:line + surrounding logs (±5s) + raw output | `TypeError: Cannot read property 'token' of undefined at auth.js:42` |
| **medium** (score 20-49) | Error message without stack, stack pointing to node_modules, or HTTP 4xx/5xx without server trace | Message + available context + occurrence count | `POST /api/login → 500 Internal Server Error` |
| **low** (score < 20) | Warning, deprecation notice, info-level log with error-like keywords | Message only, truncated | `DeprecationWarning: Buffer() is deprecated` |

Scoring factors (additive, 0-100):
- Unhandled exception / crash: +40
- Stack trace present: +20
- File:line points to user code (not node_modules): +15
- HTTP 5xx status: +15
- HTTP 4xx status: +10
- Error-level log: +10
- Warning-level log: +5
- First occurrence (new fingerprint): +10
- Recurrence (seen 3+ times): -5

**This enables Clipboard's confidence pattern without us implementing it:**

By returning structured, scored events with full evidence (message + stack + file:line + surrounding context), the agent has everything it needs to self-assess confidence. We don't gate the agent's actions - we give it the data quality signal so it can gate itself. An agent seeing a `high` signal error with a clear stack trace can act immediately. An agent seeing a `low` signal warning should gather more data first.

**Progressive disclosure (borrowed from ViewGraph):**

| Tool | Tokens | What It Returns |
|---|---|---|
| `get_runtime_status` | ~100 | Health check: connected?, error count, last error time, service list |
| `get_errors(limit=5)` | ~1,000 | Recent high+medium signal errors with messages and file:line |
| `get_error_context(fingerprint)` | ~3,000 | Full error + stack trace + surrounding logs (±5s) + occurrence history |
| `get_timeline(since, duration)` | ~5,000 | Unified chronological stream of all events (inspired by Clipboard's unified timeline) |

The agent calls the cheapest tool first and drills down only when needed - same pattern as ViewGraph's `get_page_summary` → `get_interactive_elements` → `get_capture` progression.

---

## 6. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP SERVER                               │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ MCP Tools   │  │ Event Buffer │  │ Error Parser Registry  │ │
│  │             │  │              │  │                        │ │
│  │ get_errors  │◄─┤ Ring buffer  │◄─┤ Node.js parser         │ │
│  │ watch_for.. │  │ Fingerprints │  │ Python parser          │ │
│  │ get_status  │  │ Dedup        │  │ Go parser              │ │
│  │ clear       │  │ Redaction    │  │ Java parser            │ │
│  │ get_context │  │              │  │ Rust parser            │ │
│  └─────────────┘  └──────────────┘  │ JSON (structured) parser│ │
│                                      │ Custom (user-defined)  │ │
│                                      └───────────┬────────────┘ │
│                                                   │              │
│  ┌────────────────────────────────────────────────┘              │
│  │                                                               │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  │ Process Spawner │  │ Log File Tailer │  │ Docker Logs  │ │
│  │  │ (child_process) │  │ (chokidar/tail) │  │ (docker API) │ │
│  │  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘ │
│  │           │                     │                   │         │
│  └───────────┴─────────────────────┴───────────────────┘         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    OPTIONAL (Phase 4)                         ││
│  │  ┌─────────────────┐  ┌──────────────────────────────────┐  ││
│  │  │ CDP Connector   │  │ ViewGraph Integration             │  ││
│  │  │ (browser errors)│  │ (pull network failures from VG)   │  ││
│  │  └─────────────────┘  └──────────────────────────────────┘  ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Core Data Model

```typescript
interface RuntimeEvent {
  id: string;                    // UUID
  timestamp: number;             // Unix ms
  source: 'server-stdout' | 'server-stderr' | 'build-error' | 'docker-log';
  service: string;               // Which process/container (default: "main")
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;               // Normalized, truncated to 500 chars
  stack_trace?: string;          // Top 15 frames
  fingerprint: string;           // Dedup key
  signal_score: number;          // 0-100, additive scoring (see Decision 7)
  signal_strength: 'high' | 'medium' | 'low';  // Tier derived from signal_score
  context: {
    file?: string;               // Source file if parseable
    line?: number;
    column?: number;
    framework?: string;          // "express", "django", "spring", etc.
    error_type?: string;         // "TypeError", "ImportError", etc.
    trace_id?: string;           // Extracted from traceparent/x-datadog-trace-id headers if present
  };
  raw: string;                   // Original log line(s), truncated to 1000 chars
  first_seen: number;
  occurrence_count: number;
}
```

---

## 7. User Experience

### Minimal Setup

```bash
# Install
npm install -g @devwatch/mcp-server   # or npx

# Add to MCP config (e.g., .mcp.json)
{
  "mcpServers": {
    "devwatch": {
      "command": "npx",
      "args": ["@devwatch/mcp-server", "start", "npm run dev"]
    }
  }
}
```

That's it. The agent now has access to `get_errors`, `watch_for_errors`, etc.

### Attach Mode (for existing processes)

```json
{
  "mcpServers": {
    "devwatch": {
      "command": "npx",
      "args": ["@devwatch/mcp-server", "attach", "--log-file", "./logs/server.log"]
    }
  }
}
```

### Docker Compose Mode

```json
{
  "mcpServers": {
    "devwatch": {
      "command": "npx",
      "args": ["@devwatch/mcp-server", "compose", "--file", "docker-compose.yml"]
    }
  }
}
```

### Agent Workflow (What It Looks Like in Practice)

```
Developer: "Add a /users endpoint that returns paginated users"

Agent:
  1. Reads existing code, writes the endpoint
  2. Calls get_runtime_status() → { connected: true, error_count: 0 }
  3. Calls watch_for_errors(15) → waits for hot-reload
  4. Hot-reload happens, server restarts
  5. watch_for_errors returns:
     - server-stderr: "ImportError: cannot import name 'UserSchema' from 'schemas'"
     - file: src/schemas/__init__.py, line: 3
  6. Agent reads the file, sees the schema isn't exported
  7. Fixes the import, calls watch_for_errors(10) again
  8. No errors → endpoint is working
  9. Agent reports success
```

No manual log reading. No copy-paste. The agent closed its own feedback loop.

---

## 8. Naming Candidates

| Name | Pros | Cons |
|---|---|---|
| **devwatch** | Clear, descriptive, short. "Watch your dev server." | Generic |
| **runtime-mcp** | Descriptive of what it is | Boring |
| **logpipe** | Evocative of the core function | Doesn't convey the MCP/agent angle |
| **devloop** | Captures the feedback loop concept | Might confuse with dev tooling |
| **watchdog** | Strong metaphor - it watches and alerts | Already used by Python's watchdog library |
| **tailpipe** | Log tailing + pipeline | Sounds like car exhaust |

Working name: **devwatch** - simple, memorable, describes the core function.

---

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Agents don't know to call `get_errors` after edits | Tool is useless if agent doesn't use it | Provide agent instructions/system prompt snippet. `watch_for_errors` is self-documenting. |
| Log parsing is fragile across frameworks | Missed errors, false positives | Start with the 5 most common frameworks. Structured JSON fallback. User-extensible parsers. |
| Token budget - too much log data overwhelms agent | Agent gets confused by noise | Fingerprint dedup, occurrence counting, configurable limits, structured summaries over raw logs. |
| MCP ecosystem changes | Protocol breaking changes | Pin to stable MCP SDK version. stdio transport is stable. |
| Cursor/Kiro build this in natively | Tool becomes redundant | Ship fast. Being agent-agnostic (works with ANY MCP client) is the moat. |
| Process spawning is unreliable | Dev server doesn't start properly | Attach mode as fallback. Clear error messages. |

---

## 10. Open Questions for Implementation

1. **Config file format?** - TOML? JSON? Or just CLI args? Leaning toward CLI args for MVP, config file for multi-service setups.

2. **How to handle structured vs unstructured logs?** - Auto-detect JSON lines. Fall back to regex. But what about mixed output (some lines JSON, some not)?

3. **Should we support Windows?** - Node.js child_process works on Windows, but log tailing and Docker integration have platform-specific quirks. Start Linux/macOS, add Windows later.

4. **How to handle long-running processes that don't restart on file change?** - Some dev servers (Go, Java) require manual restart. The tool should detect "no activity for N seconds after file change" and suggest restart.

5. **Should `watch_for_errors` block or poll?** - Block (hold the MCP tool call open for N seconds) is simpler for the agent. Poll (return immediately, agent calls `get_errors(since=X)` later) is more flexible. Leaning toward block.

6. **Relationship with ViewGraph?** - Separate npm package, separate MCP server. They can coexist. Phase 4 could optionally pull ViewGraph's network failure data for correlation. No hard dependency.

---

## 11. Lifecycle, Restarts & Persistence Analysis

### Process Relationship Model

devwatch is the **parent process**. The dev server is its **child**. This is the key architectural fact that determines all lifecycle behavior.

```
devwatch (parent - stays alive across restarts)
  └── npm run dev (child - restarts on hot-reload, crash, etc.)
        └── node server.js (grandchild - managed by the dev server)
```

In **attach mode** (tailing a log file), devwatch is independent of the dev server - neither is parent/child. The dev server can crash and restart without affecting devwatch.

### Scenario Analysis

| Scenario | Ring buffer | Dev server | What devwatch does |
|---|---|---|---|
| **Dev server hot-reload** (HMR, nodemon) | ✅ Survives | Child restarts | Detect restart via child exit/respawn or fresh startup logs. Inject synthetic `{ level: "info", message: "Dev server restarted" }` marker event so the agent sees the restart boundary in the timeline. |
| **Dev server crash** (unhandled exception, OOM) | ✅ Survives | Child dies | Detect via child process `exit` event. Capture exit code. Inject `{ level: "error", message: "Dev server exited with code N" }` event. Agent sees the crash in `get_errors`. |
| **devwatch crash** (our process dies) | ❌ Lost | Dies (spawn mode) / Lives (attach mode) | In spawn mode, child gets SIGTERM when parent exits. In attach mode, dev server is unaffected. Agent's MCP client detects broken stdio pipe and can respawn devwatch. Fresh buffer on restart. |
| **IDE/CLI crash** (Kiro, Cursor, Claude Code) | ❌ Lost | Dies (spawn) / Lives (attach) | Broken stdio pipe → devwatch detects, forwards SIGTERM to child, exits. IDE restarts → respawns devwatch → fresh start. Agent has lost conversation context anyway, so stale buffer wouldn't help. |
| **Machine reboot** | ❌ Lost | Dies | Everything starts fresh. No action needed. |

### Persistence Decision: Not for MVP

**Chosen path: fully ephemeral.** The ring buffer lives in memory only. When devwatch exits, the buffer is gone.

**Why this is correct for MVP:**

1. **Stale errors are noise, not signal.** Errors from a previous session are about code that may have already been changed. Showing them to the agent would be misleading.
2. **The dev server's output is the source of truth.** We're a window into it, not a database of it. If the window closes and reopens, the dev server will produce fresh output.
3. **The agent loses context too.** If the IDE crashes, the agent's conversation is gone. It doesn't remember what errors it was investigating. Persisted errors without conversation context are useless.
4. **Simplicity.** No file I/O, no corruption risk, no stale data bugs, no cleanup logic. The ring buffer is a single array in memory.

### Persistence Candidates (Parked for Later)

| Data | Value | Complexity | When |
|---|---|---|---|
| **Fingerprint history** (`{ fingerprint → { first_seen, last_seen, total_count } }`) | Lets agent ask "is this error new or was it there before I started?" | Low - single JSON file in `.devwatch/`, written on graceful shutdown | Phase 3+ |
| **Error frequency stats** ("this error appeared in 5 of your last 8 sessions") | Identifies chronic bugs vs one-off failures | Medium - needs session tracking | Phase 5+ |
| **Session replay** (full event log for post-mortem) | Debug devwatch itself, or replay a session for a different agent | High - unbounded storage, rotation policy needed | Maybe never |

If persistence is added, it's a JSON file at `.devwatch/fingerprints.json` - read on startup, written on `SIGINT`/`SIGTERM`. No database, no complex I/O.

### Graceful Shutdown Contract

When devwatch receives `SIGINT` or `SIGTERM`:
1. Forward the signal to the child dev server process
2. Wait up to 5 seconds for child to exit
3. If child hasn't exited, send `SIGKILL`
4. (Future: write fingerprint history to disk)
5. Exit with code 0

When the stdio pipe breaks (IDE crash):
1. Detect via `process.stdout` error event
2. Same shutdown sequence as above

---

## 12. Next Steps

1. **ADR** - Write ADR-001 for the tech stack and architecture decisions above
2. **Spec** - Create `.kiro/specs/devwatch-mvp/` with requirements.md, design.md, tasks.md for Phase 1
3. **Prototype** - Build the minimal spawn + parse + MCP loop to validate the concept
4. **Test with real agents** - Try it with Kiro CLI, Claude Code, and Cursor to validate the workflow

---

## Appendix A: Initial Competitive Tool Details (Pre-Research)

> **Note:** This appendix contains the initial analysis from the first research pass. See **Appendix B** for the comprehensive market catalog covering 40+ tools across all categories.

### mcp-debugger (debugmcp/mcp-debugger)
- **Stars:** 101 | **Version:** 0.20.0 | **Language:** TypeScript
- **What:** Full DAP-based step-through debugging via MCP
- **Languages:** Python (debugpy), JavaScript (js-debug), Rust (CodeLLDB), Go (Delve), Java (JDI), .NET (netcoredbg)
- **Tools:** create_debug_session, set_breakpoint, start_debugging, step_over/into/out, get_variables, evaluate_expression, etc.
- **Architecture:** MCP Server → Session Manager → Adapter Registry → Language-specific DAP adapters
- **Key insight:** Clean adapter pattern. Each language is a separate adapter. 1266+ tests.
- **Relationship to us:** Complementary. They do interactive debugging. We do passive monitoring. An agent could use both.

### Microsoft DebugMCP (microsoft/DebugMCP)
- **Stars:** 316 | **Language:** TypeScript
- **What:** VS Code extension that gives AI agents full debugger control
- **Languages:** Python, JS/TS, Java, C#, C++, Go, Rust, PHP, Ruby
- **Tools:** start_debugging, step_over/into/out, add/remove_breakpoint, get_variables_values, evaluate_expression
- **Architecture:** VS Code extension → MCP server (Streamable HTTP on localhost:3001) → VS Code Debug API
- **Key insight:** Runs 100% locally. Zero config. Auto-registers with AI assistants. VS Code-specific.
- **Relationship to us:** Complementary but VS Code-only. We're agent-agnostic.

### claude-code-debug-mode (doraemonkeys/claude-code-debug-mode)
- **Stars:** 70 | **Language:** Markdown (skill file)
- **What:** Cursor-style hypothesis-driven debugging skill for Claude Code/Codex/Gemini CLI
- **Workflow:** Bug Report → Hypotheses → Instrument Code (#region DEBUG) → Reproduce → Analyze Logs → Fix → Verify → Clean Up
- **Key insight:** Not an MCP server - it's a skill/prompt that teaches the agent a debugging methodology. Logs to `.claude/debug.log`.
- **Relationship to us:** Orthogonal. This teaches the agent HOW to debug. We give the agent WHAT to debug (the runtime data).

### agentic-debugger (iarmankhan/agentic-debugger)
- **Stars:** Small | **Language:** TypeScript
- **What:** MCP server that injects temporary logging (fetch() calls) into code to capture variable values
- **Tools:** start_debug_session, add_instrument, remove_instruments, read_debug_logs, etc. (7 tools)
- **Key insight:** Instrumentation approach - modifies source code temporarily. Uses region markers for cleanup.
- **Relationship to us:** Different approach. They inject code (active). We observe output (passive). Both valid, different use cases.

### Chrome DevTools MCP (ChromeDevTools/chrome-devtools-mcp)
- **Version:** 0.21.0 | **Language:** TypeScript
- **What:** Google's official CDP-to-MCP bridge
- **Capabilities:** Console logs, network inspection, DOM, screenshots, Lighthouse audits, performance traces, user interaction simulation
- **Key update (2026):** Multi-agent workflows, auto-connect to existing browser sessions (Chrome 144+, no more --remote-debugging-port needed)
- **Relationship to us:** Complementary. They handle the browser. We handle the backend. Phase 4 could correlate data from both.

### HUD.io Runtime Code Sensor
- **What:** Commercial product - "Runtime Code Sensor" that gives agents runtime context about production behavior
- **Key insight:** Three properties: zero config, complete, deep. "Before trying to make agents smarter, make sure they can actually see the system they're changing."
- **Relationship to us:** They're production-focused and commercial. We're dev-time and open source. Different market.

## Appendix B: Comprehensive Market Research (April 2026)

This appendix catalogs every known tool in the runtime feedback / agentic debugging space - open source and commercial - with architecture, tech stack, and framework details.

### B.1 MCP-Based Debugging & Runtime Tools (Open Source)

#### Step-Through Debuggers (DAP-based)

| Tool | Stars | Language | Architecture | Key Detail |
|---|---|---|---|---|
| **mcp-debugger** (debugmcp) | 101 | TypeScript | MCP Server → Session Manager → Adapter Registry → Language DAP adapters | v0.20.0. Python/JS/Rust/Go/Java/.NET. Clean adapter pattern. 1266+ tests. Docker + npm + npx. |
| **Microsoft DebugMCP** | 316 | TypeScript | VS Code Extension → MCP Server (Streamable HTTP, localhost:3001) → VS Code Debug API | 9 languages. Zero config. Auto-registers with AI assistants. VS Code-specific. |
| **claude-debugs-for-you** | 426 | TypeScript | VS Code Extension + MCP Server → DAP (Debug Adapter Protocol) | Language-agnostic. Works with any debugger that has a valid launch.json. Interactive expression evaluation. |
| **IDE Code Debug Bridge** | - | TypeScript | VS Code/Cursor Extension → MCP tools exposing full debugger | Exposes breakpoints, stepping, variable inspection. Claude Code can watch debugging happen live in editor. |
| **Debugssy** | - | TypeScript | VS Code Extension | Debugging assistant for VS Code. |
| **mcp_server_gdb** | - | Python | MCP Server → GDB CLI | Exposes GDB debugging capabilities via MCP. Low-level C/C++ debugging. |
| **x64DbgMCPServer** | - | C# | MCP Server → x64Dbg | Windows binary debugging via MCP. Claude/Windsurf/Cursor support. |

#### IDE Context & Diagnostics

| Tool | Stars | Language | Architecture | Key Detail |
|---|---|---|---|---|
| **vscode-mcp** (tjx666) | - | TypeScript | VS Code Extension → MCP Server (monorepo) | Real-time LSP diagnostics, type information, code navigation for AI agents. Faster than running tsc/eslint. |
| **Diagnostics MCP Server** | - | TypeScript | VS Code Extension → HTTP MCP (port 3846) | Exposes VS Code diagnostics (TS, ESLint, Prettier, all extensions). Workspace health scoring. Severity filtering. |
| **MCP Diagnostics Extension** | - | TypeScript | VS Code Extension → MCP | Real-time diagnostic problems (errors, warnings) via MCP. Production-ready. |
| **VSCode LSP MCP** | - | TypeScript | VS Code Extension → MCP | Exposes Language Server Protocol features through MCP. AI assistants get language intelligence. |
| **MCP-coding-assistant** | - | - | MCP Server | Detects hallucinations, repetitive bug fix loops ("bottomless pit"). Helps AI coders with documentation access. |

#### Container & Infrastructure Debugging

| Tool | Stars | Language | Architecture | Key Detail |
|---|---|---|---|---|
| **ig-mcp-server** (Inspektor Gadget) | - | Go | MCP Server → eBPF gadgets → Container runtimes / K8s API | Debug containers and K8s workloads via AI. Automated gadget discovery, one-click deployment. Uses eBPF for deep kernel-level tracing. |
| **Docker MCP** (QuantGeekDev) | - | TypeScript | MCP Server → Docker API | Container lifecycle management. Compose, monitor, debug Docker workflows. Not log-tailing focused. |
| **Elastic MCP App** | - | - | MCP → Elastic Observability | K8s observability. Query failures, surface ML anomalies. CI/CD deployment gates. |

#### Code Instrumentation

| Tool | Stars | Language | Architecture | Key Detail |
|---|---|---|---|---|
| **agentic-debugger** | - | TypeScript | MCP Server → Code injection (fetch() calls) → HTTP log collector (port 9876) | Inserts temporary logging instruments. Captures variable values at runtime. JS/TS/Python. 7 MCP tools. Region markers for cleanup. |

### B.2 Commercial / Paid Runtime Context Tools

#### Error Tracking & AI Debugging

| Tool | Pricing | Architecture | Key Detail |
|---|---|---|---|
| **Sentry Seer** | Flat pricing, unlimited usage | Sentry platform → Seer AI agent → MCP Server for IDE integration | AI debugging agent using Sentry telemetry (errors, spans, logs, metrics). Expanded to local dev + code review (Jan 2026). Autofix generates PRs. MCP server connects Claude Code/Cursor to Sentry issues. |
| **Sonarly** (YC W26) | - | Connects to Sentry/Datadog/Grafana → AI agent → GitHub PRs | Triages every alert, removes noise/duplicates. Investigates logs, traces, metrics, code. Builds living map of production system. Opens fix PRs. |
| **TraceRoot.AI** (YC) | Open source core | Traces + logs + metrics + code + PRs + Slack → AI agents → auto-fix | Open-source AI-native observability. Connects structured context across tools for automated bug resolution. |

#### Observability Platforms with MCP/AI Agent Support

| Tool | MCP Status | Architecture | Key Detail |
|---|---|---|---|
| **Datadog MCP Server** | GA (March 2026) | Datadog platform → MCP Server → AI agents/IDEs | Live observability data (logs, traces, metrics) to AI agents. Secure, governed access. Works with any MCP-compatible agent. |
| **Dynatrace** | GA | Dynatrace platform → MCP Server + Live Debugger | Code-level troubleshooting in any environment including production. Live Debugger is GA. Works with Claude Code, Copilot, Cline. Connector for Claude Code, Cowork, Chat. |
| **Lightrun** | Commercial | Runtime agent → IDE plugin → MCP Server | Dynamic instrumentation without redeployment. Add logs/traces/snapshots to running JVM/.NET/Node.js. Sandboxed (no thread pauses). 2026 report: "Almost half of AI-generated code fails in production." |
| **HUD.io** | Commercial (funded) | Runtime Code Sensor → Agent context | Zero-config production context for AI coding agents. Three properties: zero config, complete, deep. SOC2/ISO-27001/GDPR compliant. |
| **New Relic** | Commercial | "Intelligent Observability" platform | Advance 2026: evolving into "proactive, intelligent partner that interprets outcomes, highlights what matters, and takes action." |
| **Grafana** | Open source + Cloud | Grafana Cloud → AI Observability + MCP | GrafanaCON 2026: AI Observability in Grafana Cloud. Azure Managed Grafana MCP. GCX CLI for agent-driven workflows. o11y-bench benchmark for AI agents. |
| **Elastic** | Open source + Cloud | Elastic Observability → MCP App | K8s observability via MCP. CI/CD deployment gates. ML anomaly surfacing. OpenTelemetry integration. |

#### Dynamic Instrumentation

| Tool | Approach | Key Detail |
|---|---|---|
| **Lightrun** | Bytecode/runtime injection | Add logs, traces, snapshots to running processes without redeploy. JVM, .NET, Node.js. MCP-based. |
| **Dynatrace Live Debugger** | Platform-integrated | Code-level troubleshooting data in any environment. GA. |

### B.3 Browser-Based Tools & Extensions

#### AI-Integrated Browser Debugging

| Tool | Type | Architecture | Key Detail |
|---|---|---|---|
| **Chrome DevTools MCP** (Google) | MCP Server | Node.js → Puppeteer → CDP → Chrome | v0.21.0. 29+ tools. Console, network, DOM, Lighthouse, screenshots, performance traces. Auto-connect to existing sessions (Chrome 144+). Multi-agent workflows. |
| **Replay.io** | Chrome Extension + Platform | Chrome extension records deterministic sessions → Replay platform analyzes → MCP delivers fix to agent | Time-travel debugging. Records every DOM change, network request, state update. Finds root cause and delivers step-by-step fix to coding agent. |
| **Frontman** | Dev server middleware | Installs as middleware inside framework dev server (Next.js, Astro, Vite) | Sees live DOM, component tree, CSS styles, routes, server logs. Maps clicked elements to source code. Hot reload integration. |
| **Playwright MCP** (Microsoft) | MCP Server | @playwright/mcp → Playwright → Chromium | Official browser automation via MCP. Navigate, click, type, screenshot. 5.2k★ community version (executeautomation/mcp-playwright). |

#### Error Capture Extensions (Vibe Coding)

| Tool | Type | What It Captures | Key Detail |
|---|---|---|---|
| **VibeFix Error Reporter** | Chrome Extension | JS errors, unhandled promise rejections, console errors, network failures, resource loading issues | Targets vibe coding platforms: Bolt, Lovable, Cursor, Replit, v0. |
| **VibeCheck Track** | Chrome Extension | Screen recordings, console logs, network requests, user actions | QA-focused. Single-click capture. Shared dashboard. AI fix suggestions. |
| **Brie** | Chrome Extension (open source) | Console logs, network errors, user actions | Auto-captures context. Open source (briehq/brie-extension on GitHub). Instant developer context. |
| **Vibe Feedback** | Chrome Extension | Voice narration, element selection, navigation tracking, console errors | Structured feedback capture for vibe coding workflows. |

### B.4 IDE-Integrated Debugging Features

| IDE/Tool | Debugging Features | Architecture | Key Detail |
|---|---|---|---|
| **Cursor** | Debug Mode (hypothesis-driven), Browser feature (navigate/click/screenshot/console), Long-running agents | VS Code fork + proprietary agent | Debug Mode: instruments code with logging, generates hypotheses, collects runtime data. Browser: agent closes its own feedback loop. Long-running: multi-hour autonomous work. |
| **Windsurf** | Cascade agent with "Debug Flow", SWE-1.5 model, Codemaps, Memories | VS Code fork + Cascade AI engine | Cascade plans and executes multi-file changes. Debug Flow is a pre-defined agentic behavior. SWE-1.5 is proprietary model. Codemaps provide AI-annotated visual code navigation. |
| **Cline** | Terminal access, browser control, MCP integrations | VS Code Extension (open source) | Autonomous coding agent. Can create/edit files, run terminal commands, browse websites. Human-in-the-loop approval. cline-community MCP for reporting issues. |
| **Augment Code** | Context Engine (400k+ files), cross-repo dependencies | IDE Extension | Deep semantic codebase indexing. Architectural reasoning. Not runtime-focused but provides deep static context. |
| **Qodo** | Multi-agent code review, test generation | IDE Extension + CI | Agentic code review with specialized sub-agents. Context engineering across codebases and past PRs. |
| **Xcode 26.3** | MCP integrated into core | Native IDE integration | AI agents control build processes and read error logs directly. Radical architecture change (Feb 2026). |
| **Roblox Studio MCP** | Play sessions, output log reading, code fixing | MCP Server → Roblox Studio | AI agents start play sessions, read output logs in real-time, stop session, fix code, repeat. Autonomous debugging loop. |

### B.5 Agent Skills, Prompts & Methodology Tools

| Tool | Type | Approach | Key Detail |
|---|---|---|---|
| **claude-code-debug-mode** | Skill file (Markdown) | Hypothesis-driven: Bug → Hypotheses → Instrument (#region DEBUG) → Reproduce → Diagnose → Fix → Verify → Cleanup | Works with Claude Code, Codex, Gemini CLI. Logs to `.claude/debug.log`. Human-in-the-loop verification. 70★. |
| **MCP-coding-assistant** | MCP Server | Detects hallucinations and repetitive bug fix loops | Helps AI coders avoid "bottomless pit" debugging. Documentation access. |
| **LangChain self-healing** | GitHub Action + coding agent | Post-deploy: capture build/server logs → detect regressions → kick off Open SWE agent → fix → PR | Two paths: build failure detection + server-side regression detection over a window. |
| **Abnormal AI feedback loop** | CI pipeline integration | Process thousands of CI logs → LLM analysis → surface recurring problems → automate fixes | "Manager for the swarm of agents." Every run strengthens the next. |

### B.6 CI/CD Feedback & Log Analysis Tools

| Tool | Type | Architecture | Key Detail |
|---|---|---|---|
| **CircleCI MCP** | MCP Server (GA) | CircleCI API → MCP Server → AI agents in IDE | Pull failure logs, identify test failures, propose fixes. Available on AWS Marketplace. Works with Cursor, Claude Code, Q Developer, Windsurf. |
| **AWS Log Analyzer MCP** | MCP Server | CloudWatch Logs → MCP Server → AI agents | Search, analyze, correlate AWS CloudWatch logs. Production-focused. 149★. |
| **Elastic MCP** | MCP App | Elastic Observability → MCP → AI agents | K8s deployment gates. CI/CD pipeline acts as intelligent agent checking cluster health before changes. |

### B.7 Emerging Patterns & Standards

| Pattern | Description | Key Players |
|---|---|---|
| **OpenTelemetry + MCP** | Instrumenting MCP workflows with OTel for end-to-end tracing | Grafana (OpenLIT), Elastic, SigNoz, mintmcp.com |
| **Telemetry-as-Prompt** | Designing observability data as first-class AI input | DebuggAI methodology, Lightrun, HUD.io |
| **Self-healing CI/CD** | Automated regression detection → coding agent fix → PR | LangChain, Abnormal AI, Sonarly |
| **WebMCP (Chrome 146)** | Browser standard letting websites tell AI agents what they can do | Google Chrome (Feb 2026) |
| **MCP Registry** | GitHub's MCP Registry for discovering and integrating tools | GitHub (2026) |

---

### B.8 Architecture & Tech Stack Summary

| Category | Dominant Stack | Transport | Key Pattern |
|---|---|---|---|
| **DAP Debuggers** | TypeScript/Node.js | stdio, SSE, Streamable HTTP | MCP Server → Session Manager → Language Adapter → DAP |
| **Browser Tools** | TypeScript/Node.js | stdio (MCP), WebSocket (CDP) | Extension/Puppeteer → CDP → Chrome → MCP Server |
| **IDE Extensions** | TypeScript | In-process (VS Code API) | Extension → VS Code Debug API → MCP Server (HTTP) |
| **Observability MCP** | Various (Go, Python, TS) | Streamable HTTP, stdio | Platform API → MCP Server → AI Agent |
| **Error Capture Extensions** | JavaScript | Chrome Extension APIs | Content script → Background worker → Dashboard/API |
| **Instrumentation Tools** | TypeScript | stdio | MCP Server → AST/regex code modification → HTTP log collector |
| **CI/CD Feedback** | TypeScript/Python | stdio, HTTP | CI API → MCP Server → AI Agent in IDE |

### B.9 Competitive Gap Analysis (Updated)

```
                        COVERED ◄──────────────────────────────► OPEN GAP
                        
Step-through debugging   ████████████████████████████  (mcp-debugger, DebugMCP, claude-debugs-for-you)
Browser console/network  ████████████████████████████  (Chrome DevTools MCP, Frontman, Cursor Browser)
IDE diagnostics (LSP)    ████████████████████████      (vscode-mcp, Diagnostics MCP, LSP MCP)
Production monitoring    ████████████████████████      (Sentry, Datadog, Dynatrace, Lightrun, HUD.io)
CI/CD failure analysis   ██████████████████            (CircleCI MCP, Elastic MCP, Abnormal AI)
Code instrumentation     ██████████████                (agentic-debugger, claude-code-debug-mode)
Container/K8s debugging  ████████████                  (ig-mcp-server, Elastic MCP)
Time-travel debugging    ████████                      (Replay.io)

Dev server log tailing   ██                            ← WIDE OPEN
Edit→reload→check loop   █                             ← WIDE OPEN  
Frontend↔backend corr.   █                             ← WIDE OPEN (in dev)
Docker Compose dev logs  █                             ← WIDE OPEN
Build error MCP          ██                            ← MOSTLY OPEN
Multi-service dev watch  █                             ← WIDE OPEN
```

**Key insight:** The entire "passive observation of local dev server output" category is essentially unoccupied. Every existing tool is either:
- Interactive (requires the agent to set breakpoints and step through)
- Browser-focused (sees the frontend, not the backend)
- Production-focused (requires deployed infrastructure)
- CI/CD-focused (post-push, not during development)

Nobody simply watches your `npm run dev` terminal and tells the agent what went wrong.

---

## Appendix C: Key Quotes

> "Debugging is definitely one of the biggest pain points when working with coding agents." - Industry analysis

> "Most coding agents can't debug code at runtime like a human - missing step-by-step execution, breakpoints, and stack traces." - Developer forum

> "Almost half of AI-generated code fails in production." - Lightrun 2026 Report

> "Before trying to make agents smarter, make sure they can actually see the system they're changing." - May Walter, CTO of HUD.io, QCon London 2026

> "Coding with blindfolds on." - Michael Hablich, PM for Chrome DevTools, Google

> "The bottleneck isn't generation anymore. It's whether the system generating the code understands what happens after." - HUD.io

> "Your agent can write code, but it has no idea what happens when that code actually runs in a browser." - Michael Hablich, Google (Arcade.dev interview)

> "Agents don't have access to what actually matters in production. They see code, tests, docs. They don't see behavior." - HUD.io, QCon London 2026

> "The recent AI-related incidents weren't really about bad code... Those changes didn't look obviously wrong. They passed the review. They just didn't behave well once they hit production." - HUD.io on Amazon dev4 incidents

> "We're trying to operate Level 3 systems on top of Level 1 infrastructure." - May Walter, HUD.io

> "AI agents start play sessions, read output logs in real-time, stop the session, fix code, and go again, all without you touching anything." - Roblox Studio MCP community

> "Observability must evolve into a proactive, intelligent partner that interprets outcomes, highlights what matters and takes action on our behalf." - New Relic Advance 2026

## Appendix D: Case Study - Clipboard Health's Agent Feedback Loop (April 2026)

**Source:** "Agents Can't Iterate Against Tests That Lie" - Rocky Warren, Senior Staff Engineer, Clipboard Health (April 21, 2026)
**Open source:** `@clipboard-health/playwright-reporter-llm` + `flaky-test-debugger` skill (MIT, github.com/ClipboardHealth/core-utils)

### The Problem

Clipboard Health went from agents writing none of their code to nearly all of it in 12 months. This broke their test suite - 100% of PRs in their two largest repos hit at least one flaky E2E test. When humans write code, flakes are annoying. When agents write code, **flakes break the feedback loop that keeps agents moving at full speed.** The agent can't distinguish "my code is wrong" from "the test is lying."

### What They Built

#### 1. Agent-Driven Test Triage (Multi-Model Consensus)

They used agents to triage every E2E test. Three models with separate harnesses categorized each test, then two more agents reached consensus in fresh context windows. Result: proposed cutting 174 tests to 46. After domain owner pushback, landed at 87. Key insight: **code is a liability, and tests have maintenance cost - lying tests have the highest cost.**

#### 2. `@clipboard-health/playwright-reporter-llm` - Agent-Optimized Test Reporter

A custom Playwright reporter that outputs structured JSON designed for LLM consumption, not human reading. The report includes:

- **Unified timeline** - steps, network requests, and console events sorted by `offsetMs` (milliseconds since attempt start). Single temporal view of everything that happened.
- **Error extraction** - ANSI-stripped clean error text with extracted assertion diffs and exact file:line location.
- **Network capture** - Up to 200 requests per attempt, priority-based (fetch/xhr and errors retained over static assets). Includes timing breakdown, redirect chains, failure details.
- **Console messages** - Only high-signal entries (warning, error, pageerror, page-closed, page-crashed). Capped at 2KB/50 per attempt.
- **Failure artifacts** - Base64-encoded screenshots (max 512KB) and video paths for failing attempts.
- **Trace ID promotion** - `x-datadog-trace-id` extracted from response headers and promoted to top-level `traceId` field for direct Datadog APM correlation.
- **Retry history** - Full `attempts[]` array with per-attempt status, timing, errors, and artifacts.
- **Flaky detection** - `flaky: true` flag when test passed after retry.
- **Token budgeting** - Truncation markers (`[truncated]`), size caps on all fields, priority-based filtering.

#### 3. `flaky-test-debugger` Skill - Structured Debugging Methodology

A Claude Code skill (SKILL.md) that teaches the agent a 6-phase debugging workflow:

1. **Triage Snapshot** - Capture failing test + GitHub Actions URL, fetch LLM report
2. **Quick Classification** - Categorize the flake (test-state leakage, data collision, backend stale data, frontend cache, silent network failure, render/hydration bug, environment/infra, locator/UX drift)
3. **Analyze LLM Report** - Walk the unified timeline, compare pass vs fail attempts side-by-side, extract trace IDs for backend correlation
4. **Evidence Standard** - Require concrete artifacts before proposing a fix: error artifact + network artifact + specific code path + screenshot + Datadog trace + confidence score (1-5)
5. **Fix Decision Tree** - Validate scenario realism first, then: test harness fix → product fix → both
6. **Verification** - Lint and type-check touched files

Key design: **confidence score 2 or below = do not propose a code fix.** Instead, recommend instrumentation or reproduction steps. This prevents the agent from making speculative changes.

#### 4. `traceparent` Headers for Cross-Service Correlation

The reporter extracts `x-datadog-trace-id` from HTTP response headers and promotes it to a top-level field. This lets the agent jump from a failed E2E test straight to Datadog APM traces across 30+ backend services. **Frontend test failure → backend root cause in one hop.**

### Results

Drove E2E flake rate from 100% to under 15% in six weeks.

### Techniques Borrowable for Our Tool

| Technique | How It Applies to Our Tool | Priority |
|---|---|---|
| **Unified timeline (steps + network + console sorted by time)** | Adopted as `get_timeline(since, duration)` tool in Phase 2. Returns unified chronological stream of server logs + build events + (optionally) browser network failures, all sorted by timestamp. | **ADOPTED** |
| **Trace ID promotion / cross-service correlation** | Our Phase 4 (frontend-backend correlation) should extract trace IDs from HTTP responses and use them to link browser network failures to backend stack traces. Added `trace_id` field to `RuntimeEvent.context`. | **ADOPTED** |
| **Token budgeting (truncation, caps, priority filtering)** | Core to our design. Clipboard's specific caps are reference values: 2KB per console message, 200 network entries, 512KB screenshots, 50 console messages per window. Combined with ViewGraph-style progressive disclosure in Decision 7. | **ADOPTED** |
| **Confidence scoring for agent fixes** | Reframed as `signal_strength` / `signal_score` on RuntimeEvents (see Decision 7). We score the *data quality*, not the diagnosis. ViewGraph's salience model applied to runtime errors. The agent uses our signal to self-assess its own confidence. | **ADOPTED (as Decision 7)** |
| **Flake classification taxonomy** | The 8-category classification (test-state leakage, data collision, backend stale data, etc.) is useful for our `watch_for_errors` tool. When errors appear intermittently, we could tag them with a likely category based on pattern matching. | **LOW** |
| **Pass vs fail comparison (timeline diffing)** | Enabled by `get_timeline`. Agent can call it twice (before and after a change) and diff. `watch_for_errors` is the simpler version of this. | **MEDIUM** |
| **Evidence standard (don't fix without artifacts)** | Baked into our response format: every RuntimeEvent includes message + stack + file:line + surrounding context + signal_strength. Never return just a message string. Progressive disclosure ensures the agent can always drill deeper. | **ADOPTED** |
| **Multi-model consensus for triage** | Interesting for test suite health analysis but not directly applicable to our runtime monitoring tool. Worth noting for future features. | **LOW** |

### Key Quote

> "When humans write code, flakes are annoying. When agents write code, flakes break the feedback loop that keeps them moving at full speed."

This perfectly captures why our tool matters: **the agent's feedback loop depends on reliable, structured runtime data.** If the data is noisy, incomplete, or ambiguous, the agent can't iterate effectively - same problem as flaky tests, but for runtime errors.

---

## Appendix E: Chrome DevTools MCP - Deep Architecture Analysis & Borrowable Patterns

**Source:** github.com/ChromeDevTools/chrome-devtools-mcp (v0.23.0, 37.4k★, Apache-2.0)
**Stack:** TypeScript, Puppeteer (CDP bridge), MCP SDK, Rollup bundler
**Transport:** stdio (primary), CLI mode (secondary)

### E.1 Architecture

```
AI Agent (Kiro, Claude, Cursor, Copilot, Gemini CLI, etc.)
    │ MCP (JSON-RPC over stdio)
    ▼
chrome-devtools-mcp (Node.js MCP server)
    │ Puppeteer (CDP WebSocket)
    ▼
Chrome Browser (launched or connected)
    ├── Page 1 (selected)
    ├── Page 2
    └── Page N
```

Key architectural choices:
- **Puppeteer as the CDP bridge** - not raw CDP. Puppeteer handles connection management, auto-waiting, and browser lifecycle. This is why their automation feels smooth.
- **Persistent Chrome profile** - browser state (cookies, storage, logins) persists across sessions by default. `--isolated` flag for clean sessions.
- **Page selection model** - tools operate on the "currently selected page." `list_pages` → `select_page` → then all tools target that page. Simple mental model.
- **Snapshot-based element targeting** - `take_snapshot` returns an a11y tree with `uid` per element. All interaction tools (`click`, `fill`, `hover`) take a `uid`, not a CSS selector. This is more stable than selectors.

### E.2 Tool Categories (34 tools across 8 categories)

| Category | Count | Tools | What It Does |
|---|---|---|---|
| **Input automation** | 9 | click, drag, fill, fill_form, handle_dialog, hover, press_key, type_text, upload_file | Interact with page elements via uid |
| **Navigation** | 6 | close_page, list_pages, navigate_page, new_page, select_page, wait_for | Multi-tab management, navigation, waiting |
| **Emulation** | 2 | emulate, resize_page | Dark mode, network throttling, geolocation, viewport, CPU throttling |
| **Performance** | 3 | performance_start_trace, performance_stop_trace, performance_analyze_insight | Record traces, analyze LCP/CLS/INP insights |
| **Network** | 2 | list_network_requests, get_network_request | Inspect HTTP requests with filtering and pagination |
| **Debugging** | 6 | evaluate_script, get_console_message, list_console_messages, lighthouse_audit, take_screenshot, take_snapshot | JS execution, console, Lighthouse, visual capture |
| **Extensions** | 5 | install/list/reload/trigger/uninstall_extension | Manage Chrome extensions (opt-in via flag) |
| **Memory** | 1 | take_memory_snapshot | Heap snapshots for memory leak analysis |

### E.3 Design Principles (from their docs)

1. **Agent-Agnostic API** - MCP standard, no LLM lock-in
2. **Token-Optimized** - Semantic summaries over raw data. "LCP was 3.2s" > 50K lines of JSON
3. **Small, Deterministic Blocks** - Composable tools (click, screenshot), not magic buttons
4. **Self-Healing Errors** - Actionable errors with context and potential fixes
5. **Human-Agent Collaboration** - Output readable by machines (structured) AND humans (summaries)
6. **Progressive Complexity** - Simple by default, advanced optional args for power users
7. **Reference over Value** - Heavy assets (screenshots, traces) return file paths, not raw data

### E.4 Skills System (How Agents Learn Debug Sequences)

Chrome DevTools MCP ships with **6 skills** - SKILL.md files that teach agents structured debugging workflows. This is the "Kiro should know debug sequences" part.

| Skill | What It Teaches |
|---|---|
| **chrome-devtools** | Core workflow: navigate → wait → snapshot → interact. Page selection model. Efficient data retrieval patterns. Parallel execution rules. |
| **debug-optimize-lcp** | 5-step LCP debugging: record trace → analyze insights → identify LCP element → check network waterfall → inspect HTML. Includes optimization strategies ranked by subpart. |
| **memory-leak-debugging** | Capture baseline/target/final snapshots → use memlab to find leaks → identify common patterns (detached DOM, closures, unbounded caches). "Repeat interactions 10x to amplify the leak." |
| **a11y-debugging** | Accessibility debugging workflow using Lighthouse audit + snapshot inspection. |
| **troubleshooting** | Self-diagnosis when chrome-devtools-mcp itself has issues. |
| **chrome-devtools-cli** | CLI-specific usage patterns (non-MCP). |

**Key pattern:** Each skill is a structured recipe with numbered steps, tool call sequences, and decision trees. The agent doesn't have to figure out the workflow - the skill tells it exactly which tools to call in which order.

### E.5 What devwatch Should Borrow (Without Duplicating)

Chrome DevTools MCP owns the browser. We own the backend. The overlap zone is **the moment after the agent makes a code change** - Chrome DevTools MCP can verify the frontend, we verify the backend. Here's what we should borrow:

#### Pattern 1: Skills as Debug Recipes (HIGH - adopt for devwatch)

Chrome DevTools MCP's skills are the reason agents use it smoothly. We need the same for backend debugging. Devwatch should ship with skills:

| Skill | Sequence |
|---|---|
| **backend-error-triage** | `get_runtime_status` → `get_errors(limit=5)` → for each high-signal error: `get_error_context(fingerprint)` → read source file at file:line → propose fix |
| **edit-verify-loop** | Agent edits code → `watch_for_errors(15)` → if errors: `get_error_context` → fix → `watch_for_errors(10)` → if clean: done |
| **full-stack-debug** | `get_errors` (backend) + Chrome DevTools `list_console_messages` (frontend) + Chrome DevTools `list_network_requests` (network) → correlate by timestamp and URL → identify which layer failed |

The `full-stack-debug` skill is the **cross-tool orchestration** - it teaches the agent to use devwatch AND Chrome DevTools MCP together. This is the complement, not the duplicate.

#### Pattern 2: Snapshot-Based Interaction Model (MEDIUM - adapt concept)

Chrome DevTools MCP's `take_snapshot` → get `uid` → `click(uid)` pattern is elegant because the agent always works with a fresh, structured view of the current state. Our equivalent:

- `get_errors` is our "snapshot" - a structured view of the current error state
- `fingerprint` is our "uid" - a stable identifier for drilling into a specific error
- `get_error_context(fingerprint)` is our "click" - deep interaction with a specific element

We should make this explicit in our tool descriptions so agents recognize the pattern.

#### Pattern 3: `includeSnapshot` Pattern (LOW - consider)

Many Chrome DevTools MCP tools have an `includeSnapshot: boolean` parameter - after clicking a button, optionally return the updated page state in the same response. Our equivalent: `watch_for_errors` could have an `include_context: boolean` that, when true, automatically includes `get_error_context` data for any high-signal errors found. Saves a round-trip.

#### Pattern 4: File Path for Heavy Assets (HIGH - adopt)

Chrome DevTools MCP returns file paths for screenshots, traces, and heap snapshots instead of inline data. We should do the same for `get_timeline` when the output exceeds a threshold - write to a temp file and return the path. This prevents blowing up the agent's context window.

#### Pattern 5: Category Flags (MEDIUM - adopt)

Chrome DevTools MCP uses `--category-extensions`, `--category-performance`, etc. to enable/disable tool groups. We should support `--parsers=node,python` to enable only relevant framework parsers, reducing noise and tool surface.

#### Pattern 6: Emulation for Reproduction (LOW - future)

Chrome DevTools MCP's `emulate` tool (network throttling, CPU throttling, geolocation) helps reproduce conditions. Our future equivalent: `emulate_load` could simulate high-concurrency or slow-database conditions for the dev server. Very future, but the pattern is sound.

### E.6 What devwatch Should NOT Borrow

| Chrome DevTools MCP Feature | Why Not |
|---|---|
| Input automation (click, fill, drag, hover) | Browser interaction is their domain. We don't touch the browser. |
| Page management (list_pages, select_page, new_page) | We manage processes, not pages. |
| Screenshots / visual inspection | ViewGraph and Chrome DevTools MCP handle visual. We handle text logs. |
| Lighthouse audits | Frontend quality tool. Not our scope. |
| Extension management | Chrome-specific. Irrelevant to backend monitoring. |
| Memory snapshots | Heap analysis is a different debugging modality. |

### E.7 The Complement Story (devwatch + Chrome DevTools MCP + ViewGraph)

The three tools together give the agent complete visibility:

```
Agent makes a code change to a full-stack app
    │
    ├── devwatch: "Did the backend crash? Any new errors in server logs?"
    │   └── watch_for_errors(15) → server-side stack traces, build errors
    │
    ├── Chrome DevTools MCP: "Does the page work? Any console errors? Network failures?"
    │   └── navigate_page → take_snapshot → list_console_messages → list_network_requests
    │
    └── ViewGraph: "Does the UI look right? Any a11y issues? Layout broken?"
        └── request_capture → get_page_summary → audit_accessibility
```

The agent uses all three in sequence: backend first (fastest feedback - no browser needed), then browser verification, then visual/a11y verification. The `full-stack-debug` skill teaches this exact sequence.

---

## Appendix F: Source Documents

1. `docs/ideas/Developer Pain Points in Agentic Coding.md` - Pain point analysis, 3 architectural models, ViewGraph complement strategy
2. `docs/ideas/viewgraph-runtime-feedback-analysis.md` - ViewGraph-specific opportunity mapping, 8 enhancement opportunities, product boundary decisions
3. `docs/ideas/research-agentic-runtime-feedback-loop.md` - Comprehensive research: tools, academic papers, 4 architectural patterns, 6-phase roadmap, concrete MCP tool designs
4. Clipboard Health: "Agents Can't Iterate Against Tests That Lie" (April 2026) - Case study on agent feedback loops, `@clipboard-health/playwright-reporter-llm`, `flaky-test-debugger` skill. Source: clipboardworks.com/blog + github.com/ClipboardHealth/core-utils
