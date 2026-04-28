# ADR-001: Tech Stack and Core Architecture Decisions

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-04-27 |
| **Decision Makers** | Sourjya Dutta |

## Context

TracePulse is a runtime feedback MCP server for AI coding agents. It watches dev server stdout/stderr, parses errors into structured events with signal scoring, and exposes them as MCP tools that any agent can call. The agent edits code, calls `watch_for_errors(15)`, and instantly knows if the fix worked — no manual log reading, no copy-paste.

This ADR captures the foundational technology and architecture decisions made during the planning phase, based on competitive landscape analysis of 40+ tools (April 2026), the MCP ecosystem's current state, and the product's positioning as a passive runtime observer for local development.

The full analysis is in `docs/ideas/feature-architecture-analysis.md`.

## Decision Drivers

- **Zero-config adoption** — `npx tracepulse start "npm run dev"` must work without setup
- **Agent-agnostic** — must work with any MCP-compatible client (Kiro, Claude Code, Cursor, Copilot, Cline, Windsurf)
- **MCP ecosystem alignment** — the MCP SDK, Chrome DevTools MCP, mcp-debugger, and agentic-debugger are all TypeScript
- **Token efficiency** — agents have limited context windows; every response must be structured and scored for relevance
- **Complementary positioning** — Chrome DevTools MCP owns the browser, mcp-debugger owns step-through debugging, we own passive backend observation
- **Simplicity** — fewer moving parts means easier adoption and maintenance

## Considered Options

### 1. Language

| Option | Pros | Cons |
|--------|------|------|
| **TypeScript (Node.js 22+)** | MCP SDK is TS-first; `child_process` is native; distributable via `npx`; CDP libraries (Puppeteer) are JS; matches ecosystem (Chrome DevTools MCP, mcp-debugger) | Heavier runtime than Go/Rust for a CLI tool |
| **Python** | Strong in ML/data; good subprocess support | MCP SDK is TS-first (Python SDK exists but lags); no `npx` equivalent for zero-install distribution; slower startup |
| **Go** | Fast startup; single binary distribution; excellent concurrency | MCP SDK has no official Go implementation; would need to implement protocol from scratch or use community SDK; no `npx` distribution |
| **Rust** | Maximum performance; single binary | Same MCP SDK gap as Go; much higher development cost for a tool where I/O latency dominates, not CPU |

### 2. MCP Transport

| Option | Pros | Cons |
|--------|------|------|
| **stdio (primary)** | Standard for local MCP servers; simplest; every MCP client supports it; no port conflicts | Single client only; no dashboard/web UI possible |
| **SSE (Server-Sent Events)** | Enables push notifications; multi-client | Being deprecated in MCP spec in favor of Streamable HTTP; one-directional |
| **Streamable HTTP** | Multi-client; bidirectional; future-proof per MCP spec | More complex setup; not needed for MVP; requires port allocation |
| **stdio + Streamable HTTP (secondary)** | Best of both: stdio for standard agent use, HTTP for multi-client scenarios later | Two transport implementations to maintain |

### 3. Process Management

| Option | Pros | Cons |
|--------|------|------|
| **Spawn only** | Simplest; direct stdout/stderr capture; full lifecycle control | Forces users to change how they start their dev server |
| **Attach only (log file tailing)** | Works with any existing process; no workflow change | Requires log file path; misses stderr unless redirected; no lifecycle control |
| **Spawn OR Attach** | Spawn is the zero-config default; attach is the escape hatch for complex setups | Two code paths to maintain |

### 4. Error Parsing Strategy

| Option | Pros | Cons |
|--------|------|------|
| **Framework-specific regex + JSON fallback** | Handles unstructured output (most dev servers); auto-detects structured JSON (pino, structlog); extensible per framework | Regex parsers are fragile; need maintenance per framework |
| **JSON-only (require structured logging)** | Clean, reliable parsing | Most dev servers output unstructured text; would miss the majority of errors |
| **LLM-based parsing** | Handles any format; no regex maintenance | Adds latency, cost, and an external dependency; overkill for well-known error formats |
| **Generic line-level heuristics** | Simple; no framework knowledge needed | Low accuracy; can't extract stack traces, file:line, or error types reliably |

### 5. Browser Integration

| Option | Pros | Cons |
|--------|------|------|
| **No browser extension** | Fewer moving parts; clear scope boundary; Chrome DevTools MCP and ViewGraph handle browser | No frontend-backend correlation without CDP (Phase 4) |
| **Browser extension** | Direct access to console, network, DOM | Duplicates Chrome DevTools MCP; duplicates ViewGraph; adds installation friction; maintenance burden across browsers |
| **CDP connection (Phase 4 only)** | Enables HTTP correlation without an extension | Optional dependency; only for advanced use cases |

### 6. Data Flow Model

| Option | Pros | Cons |
|--------|------|------|
| **Pull-first (agent calls tools on demand)** | Agent controls when it queries; simpler; no noise; works with all MCP clients today | Agent must know to call tools after edits |
| **Push-first (tool notifies agent)** | Agent gets immediate feedback | MCP notification support is immature; risks overwhelming agent with noise; harder to filter |
| **Pull-first, push later** | Pull for Phase 1-4 (proven, simple); push in Phase 5 when filtering is battle-tested | Two interaction models to eventually support |

### 7. Event Scoring Model

| Option | Pros | Cons |
|--------|------|------|
| **Salience scoring (0-100 + high/medium/low tiers)** | Token-efficient progressive disclosure; agent can prioritize; proven by ViewGraph's salience model and Clipboard Health's confidence scoring | Scoring heuristics need tuning; edge cases in scoring |
| **No scoring (return everything equally)** | Simpler implementation | Wastes agent tokens on low-value events; agent can't prioritize |
| **Binary (error vs not-error)** | Simple | Loses nuance; deprecation warnings and crashes treated the same |

### 8. Event Storage

| Option | Pros | Cons |
|--------|------|------|
| **In-memory ring buffer (500 events)** | Zero I/O; no corruption risk; no stale data; simple | Lost on process exit; no cross-session history |
| **SQLite** | Persistent; queryable; cross-session history | Overkill for dev-time ephemeral data; adds dependency; stale errors mislead agents |
| **File-based append log** | Persistent; simple | Unbounded growth; needs rotation; stale data problem |

## Decision

### Decision 1: TypeScript on Node.js 22+

The MCP SDK (`@modelcontextprotocol/sdk`) is TypeScript-first. Process spawning via `node:child_process` is native. Distribution via `npx` gives zero-install adoption. The entire MCP tooling ecosystem (Chrome DevTools MCP, mcp-debugger, agentic-debugger) is TypeScript. Fighting the ecosystem for marginal performance gains in a tool where I/O latency dominates would be a poor tradeoff.

### Decision 2: stdio primary, Streamable HTTP secondary

stdio is the standard transport for local MCP servers spawned by agents. Every MCP client supports it. Streamable HTTP will be added in Phase 3+ to enable multi-client scenarios (e.g., agent + monitoring dashboard). SSE was rejected because the MCP spec is moving away from it toward Streamable HTTP.

### Decision 3: Spawn OR Attach

Spawn mode starts the dev server as a child process — this is the zero-config default (`npx tracepulse start "npm run dev"`). Attach mode tails log files for developers who can't or don't want to change how they start their server. Both are supported from Phase 1. Spawn is the recommended path.

### Decision 4: Framework-specific regex + JSON fallback

Most dev servers output unstructured text. Regex parsers for Node.js, Python, Go, Java, and Rust stack traces handle the common cases. If a line is valid JSON (pino, structlog, logback JSON), it's parsed directly. The parser registry is extensible — users can add custom patterns via config. LLM-based parsing was rejected as overkill for well-known error formats.

### Decision 5: No browser extension

Chrome DevTools MCP already bridges the browser to agents. ViewGraph already provides UI context via a browser extension. TracePulse is backend-focused. Adding a browser extension would duplicate existing tools and add installation friction. Phase 4 optionally connects to Chrome via CDP for HTTP correlation — no extension needed.

### Decision 6: Pull-first, push later

The agent calls `get_errors` or `watch_for_errors` when it wants runtime data. This gives the agent control over when it queries, avoids noise, and works with every MCP client today. Push notifications (Phase 5) will be added once MCP notification support matures and our filtering heuristics are battle-tested.

### Decision 7: Salience-scored runtime events

Every `RuntimeEvent` gets a `signal_score` (0-100) computed from additive factors and a derived `signal_strength` tier (`high` ≥ 50, `medium` 20-49, `low` < 20). This is inspired by ViewGraph's salience model (scoring DOM elements for diagnostic value) and Clipboard Health's confidence scoring (gating agent action on evidence quality).

Scoring factors (additive):
- Unhandled exception / crash: +40
- Stack trace present: +20
- File:line in user code (not node_modules): +15
- HTTP 5xx: +15
- HTTP 4xx: +10
- Error-level log: +10
- Warning-level log: +5
- First occurrence (new fingerprint): +10
- Recurrence (3+ times): -5

This enables progressive disclosure: `get_runtime_status` (~100 tokens) → `get_errors` (~1,000 tokens) → `get_error_context` (~3,000 tokens). The agent calls the cheapest tool first and drills down only when needed.

### Supporting Decisions

**In-memory ring buffer (500 events):** Fully ephemeral. No persistence for MVP. Stale errors from previous sessions would mislead agents. The dev server's output is the source of truth — we're a window into it, not a database. Fingerprint history persistence (`.tracepulse/fingerprints.json`) is parked for Phase 3+.

**Build tool: tsup.** esbuild-based bundler that produces a zero-dependency distribution bundle. Fast builds, tree-shaking, and ESM/CJS dual output.

**Test runner: vitest.** Native TypeScript support, ESM-first, fast execution, compatible with the Jest API surface. Matches the TypeScript ecosystem choice.

**MCP SDK: `@modelcontextprotocol/sdk`.** The official TypeScript SDK for MCP server implementation. Handles JSON-RPC protocol, tool registration, and transport abstraction.

## Consequences

### Positive

- **Zero-config adoption** — `npx tracepulse start "npm run dev"` works without installation or configuration
- **Agent-agnostic** — stdio transport works with every MCP client; no vendor lock-in
- **Ecosystem alignment** — TypeScript + MCP SDK means first-class protocol support and community compatibility
- **Token efficiency** — signal scoring and progressive disclosure prevent context window bloat
- **Clear scope boundary** — no overlap with Chrome DevTools MCP (browser) or mcp-debugger (step-through debugging)
- **Simple mental model** — spawn your server, agent queries errors, done
- **Extensible parsing** — new framework parsers are isolated modules implementing a common interface

### Negative

- **Node.js runtime overhead** — heavier than a Go/Rust binary for a CLI tool, though startup time is acceptable for a long-running server process
- **Regex parser maintenance** — framework-specific parsers need updates as error formats evolve across framework versions
- **No cross-session memory (MVP)** — the agent can't ask "was this error present yesterday?" until fingerprint persistence is added
- **stdio is single-client** — only one agent can connect at a time until Streamable HTTP is added

### Risks

| Risk | Mitigation |
|------|------------|
| MCP SDK breaking changes | Pin to stable SDK version; stdio transport is the most stable layer |
| Regex parsers miss errors in new framework versions | JSON fallback catches structured logs; parser registry is extensible; community can contribute parsers |
| IDE vendors build this natively (Cursor, Kiro) | Ship fast; agent-agnostic design is the moat — works with ANY MCP client, not just one IDE |
| Agents don't know to call tools after edits | Ship skills (SKILL.md) that teach agents the edit-verify loop; `watch_for_errors` is self-documenting via its MCP tool description |
| Signal scoring heuristics produce false rankings | Scoring factors are configurable; start conservative; tune based on real-world usage |

## Links

- [Roadmap M1](../roadmap/roadmap.md) — milestone where this decision was made
- [Feature & Architecture Analysis](../ideas/feature-architecture-analysis.md) — full competitive landscape, gap analysis, and design rationale
- [ViewGraph](https://github.com/sourjya/viewgraph) — companion UI context tool whose salience model inspired Decision 7
- Clipboard Health case study (Appendix D of architecture analysis) — confidence scoring pattern that informed signal scoring
