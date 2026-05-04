# Research Index

Master index of all TracePulse research. Each entry links to the research document and the roadmap items it informed.

Last updated: 2026-05-02

---

## Strategic Research

| Document | Date | Summary | Roadmap Items Derived |
|----------|------|---------|----------------------|
| [Environment Detection & Zero-Config Architecture](environment-detection-zero-config-research.md) | 2026-05-04 | Why MCP servers have different environments than user shells. Capability layers, centralized detection, venv auto-detection, startup diagnostics. 3 critical bugs found. | M21 (zero-config, start_server, project detection, bin wrapper) |
| [TracePulse-CoreIQ Integration Design](tracepulse-coreiq-integration-design.md) | 2026-05-05 | How TracePulse plugs into CoreIQ via manifest registration (ADR-003). REST endpoints, API key auth, Docker integration. No fork or bridge needed. | M22 (REST API, manifest registration, API key auth) |
| [Deep Research - Competitive Landscape & Roadmap 2026](agentic-debug-loop-deep-research-2-2026.md) | 2026-04-30 | Founder-grade competitive analysis. Lightrun, Sentry Seer, Replay.io, DAP-MCP, eBPF. 10 strategic recommendations. | M13 (hooks, token audit, drift), M14 (DAP bridge, Sentry export, dashboard, multi-agent) |
| [MCP Tooling Research - Rearchitecting TP & VG](mcp-tooling-research--the-case-for-rearchitecting-tracepulse-and-viewgraph.md) | 2026-05-01 | Token overhead analysis. Tool clustering, progressive disclosure, environmental impact. | M15 (tool clustering, description compression, token audit) |
| [Platform Strategy - v1.0 Priorities](viewgraph-tracepulse-v1-platform-strategy.md) | 2026-05-01 | Stack Overflow/JetBrains/GitHub data. Python gap, Go opportunity, testing ecosystem. | M16 (Pydantic parser, air hot-reload, Spring Boot, monorepo routing, pnpm/Bun docs) |
| [Competitive IP Positioning](competitive-ip-positioning.md) | 2026-05-01 | Patent landscape, safe positioning language, AGPL-3.0 defense. | Marketing language guidelines |

## Competitive Analysis

| Document | Date | Summary | Roadmap Items Derived |
|----------|------|---------|----------------------|
| [Competitive Analysis](competitive/competitive-analysis.md) | 2026-04-28 | Chrome DevTools MCP, BrowserTools, agentic-debugger, Sentry MCP comparison. | M7 (skills), companion tool positioning |
| [Feature Matrix](competitive/feature-matrix.md) | 2026-04-28 | 60+ capability comparison across 5 tools. | GitBook comparison pages |

## Ecosystem & Architecture

| Document | Date | Summary | Roadmap Items Derived |
|----------|------|---------|----------------------|
| [Ecosystem Analysis](ecosystem/ecosystem-analysis.md) | 2026-04-28 | MCP ecosystem, agent landscape, integration opportunities. | M8 (infra awareness), M9 (discovery) |
| [Ecosystem Expansion Opportunities](ecosystem/tracepulse-ecosystem-research-expansion-opportunities.md) | 2026-04-29 | Tier 1/2/3 feature prioritization from real session data. | M12 (error clustering, migration status, audit trail, perf baseline, error narratives) |
| [Feature Architecture Analysis](feature-architecture-analysis.md) | 2026-04-28 | Technical architecture for planned features. | M3-M5 (multi-process, correlation, proactive) |
| [Agentic Runtime Feedback Loop](research-agentic-runtime-feedback-loop.md) | 2026-04-27 | Foundational research on runtime feedback for AI agents. | Core architecture (pipeline, scoring, fingerprinting) |
| [ViewGraph Runtime Feedback Analysis](viewgraph-runtime-feedback-analysis.md) | 2026-04-28 | How ViewGraph and TracePulse complement each other. | Three-layer stack design, ViewGraph handover |

## Token Savings & Efficiency

| Document | Date | Summary | Roadmap Items Derived |
|----------|------|---------|----------------------|
| [Advanced Token Savings Research](tracepulse-advanced-token-savings-research.md) | 2026-05-02 | 12 dimensions, 40-80% additional savings. Tool Attention, delta responses, loop detection, semantic compression, push notifications. | M17 (Wave 1 quick wins), M18 (Wave 2 medium effort) |
| [Operations & Token Savings Report](tracepulse-operations-and-token-savings.md) | 2026-05-02 | Full feature inventory, 6 token saving mechanisms, 90.6% savings analysis. | Demo designs, marketing metrics |
| [Token Savings Research Prompt](token-savings-research-prompt.md) | 2026-05-02 | 12-dimension research prompt for advanced token savings. | Advanced Token Savings Research (above) |

## Agent Feedback (Real-World Usage)

| Document | Date | Summary | Roadmap Items Derived |
|----------|------|---------|----------------------|
| [Agent Feedback Log](agent-feedback/agent-feedback-log.md) | Rolling | 78 entries from 4 real projects. Wins, gaps, patterns, chokepoints. | Wishlist items, SKILL.md updates, verify_fix claims, routing hints, standalone mode, venv support |
| [Agent Wishlist](agent-feedback/agent-wishlist.md) | Rolling | 38 items, 24 shipped. Feature requests from agents. | M12 features, run_and_watch cwd, standalone mode, test summary |
| [Session Reports](agent-feedback/session-reports.md) | 2026-04-28 | 3 full-day session summaries from Nexus project. | M7-M8 features, hot-reload patterns |
| [Feature Request Analysis (Session 3)](agent-feedback/feature-request-analysis-session3.md) | 2026-04-28 | 6 requests analyzed for scope/effort/impact. | get_requests tool, health probe, structlog parser |
| [Wishlist Session 4](agent-feedback/wishlist-session4.md) | 2026-04-29 | 6 themes: build awareness, context, continuity, noise, verification. | verify_fix, debounced errors, file-change correlation |

## Parser Validation

| Document | Date | Summary | Roadmap Items Derived |
|----------|------|---------|----------------------|
| [Parser Samples - Runtime](parser-samples-runtime.md) | 2026-05-01 | 27 real-world samples for 8 runtime parsers. Sources cited. | Golden file test system, parser accuracy benchmark |
| [Parser Samples - Build & Test](parser-samples-build-test.md) | 2026-05-01 | 30 real-world samples for 10 build/test parsers. | Golden file test system |
| [Parser Samples - Infra & Worker](parser-samples-infra-worker.md) | 2026-05-01 | 22 real-world samples for 6 infra/worker parsers. | Golden file test system |

## Experiments & Benchmarks

| Document | Date | Summary | Roadmap Items Derived |
|----------|------|---------|----------------------|
| [Experiments Index](experiments-index.md) | 2026-05-02 | 2 running, 1 planned, 2 specced experiments. Parser accuracy, pipeline throughput, session insights. | get_session_insights tool, error histogram |

## Enterprise

| Document | Date | Summary | Roadmap Items Derived |
|----------|------|---------|----------------------|
| M19 Team Server Spec | 2026-05-02 | Shared TracePulse instance for teams. HTTPS, multi-tenant, cross-developer fingerprints, team audit. | M19 (v1.2) |

## Other

| Document | Date | Summary |
|----------|------|---------|
| [Developer Pain Points](developer-pain-points-agentic-coding.md) | 2026-04-27 | User pain points driving TracePulse's design |
| [Untracked Ideas Audit](untracked-ideas-audit.md) | 2026-04-29 | Ideas not yet on roadmap |
| [Future Research](future-research.md) | 2026-04-28 | Long-term research directions |

---

## How to Add New Research

1. Create the document in `docs/research/` (or appropriate subdirectory)
2. Add an entry to this index with: document link, date, summary, roadmap items derived
3. If the research informs roadmap changes, update `docs/roadmap/roadmap.md` and link back to the research
4. Commit both the research and the index update together
