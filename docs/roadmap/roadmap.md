# Project Roadmap

## Current Version

v0.9.31 (alpha - 44 MCP tools, 25 parsers, 1380 tests)

## Milestones

| Milestone | Phase | Version | Status |
|-----------|-------|---------|--------|
| M1: Core Pipeline MVP | Phase 1 | v0.2.0 | ✅ Complete |
| M2: Watch Mode | Phase 2 | v0.3.0 | ✅ Complete |
| M3: Multi-Process & Docker | Phase 3 | v0.4.0 | ✅ Complete |
| M4: Frontend-Backend Correlation | Phase 4 | v0.5.0 | ✅ Complete |
| M5: Proactive Monitoring | Phase 5 | v0.6.0 | ✅ Complete |
| M7a: Multi-File Attach + Filters | Agent Feedback | v0.7.0 | ✅ Complete |
| M7b: Test Runner Integration | Agent Feedback | v0.7.1 | ✅ Complete |
| M7c: Agent Workflow Skills | Competitive Research | v0.7.2 | ✅ Complete |
| M8: Dev Infrastructure Awareness | Agent Feedback + Research | v0.8.0 | ✅ Complete |
| M9: Infrastructure Discovery & Health | Research | v0.9.0 | ✅ Complete |
| M10: Project Health & Dependency Awareness | Gap Analysis | v0.9.1 | ✅ Complete |
| M11: Agent Workflow Intelligence | Agent Feedback | v0.9.2 | ✅ Complete |
| M12: Ecosystem Research Features | Research | v0.9.2 | ✅ Complete |
| M-Harden: Code Quality & Hardening | CRR-001 | v0.9.2 | ✅ Complete (13/13 items) |
| M13: Discoverability & Integration | Deep Research | v0.9.3 | ✅ Complete |
| M14: Category Extension | Deep Research | v0.9.4-v1.0 | 🔲 Planned |
| M15: Tool Schema Optimization | MCP Tooling Research | v1.0 | ✅ Complete |
| M16: Platform Coverage Expansion | Platform Strategy Research | v1.0 | 🔲 Planned |
| M17: Token Savings Wave 1 (Quick Wins) | Advanced Token Research | v1.0 | ✅ Complete |
| M18: Token Savings Wave 2 (Medium Effort) | Advanced Token Research | v1.1 | 🔲 Planned |
| M24: DevLoop Agent — Cross-Layer Correlation | Agent Feedback | v1.0 | ✅ Complete (Phase 1-3) |
| M19: TracePulse Team Server | Enterprise | v1.2 | 🔲 Planned |
| M20: Bug Pattern Detection | Error Intelligence | v1.1 | ✅ Complete |
| M21: Zero-Config Capability Architecture | Core UX | v1.0 | ✅ Complete (Phase 1-3) |
| M22: HTTP REST API + Dashboard Integration | Platform | v1.0 | ✅ Complete |
| M23: `tracepulse init` - Context-Aware Setup | Discoverability | v1.0 | 🔲 Spec ready |
| M25: Agent Compliance & Self-Correction | Agent Feedback | v1.0 | 🔲 Planned |
| M26: Intelligent Feedback | Deep Research + Feedback | v1.1 | 🔲 Spec ready |
| M27: Effectiveness Telemetry | Field Usage + ROI | v1.1 | 🟡 In Progress (D1+D4+D16 shipped) |
| M28: Safe Agent Command Execution | Security — v0.9.31 Threat Model | v0.9.31+ | 🟡 Phase A build-ready (reviewed); Phase B gated on B-0 |

## Reviews

| Review | Date | Scope | Report |
|--------|------|-------|--------|
| SRR-005 | 2026-05-05 | T3 security - full codebase (v0.9.16) | [Report](../audits/security/SRR-005-2026-05-05-T3.md) |
| MRR-003 | 2026-05-05 | Maintainability - full codebase (v0.9.16) | [Report](../audits/maintainability/MRR-003-2026-05-05.md) |
| Docs: Tool Reference Deep-Linking | Documentation | v1.0 | ✅ Complete |
| M6: Stable Release | Release | v1.0.0 | 🔲 Planned |

---

## M13: Discoverability & Integration ✅ COMPLETE (informed by Deep Research 2026-04-30)

Source: [Deep Research - Competitive Landscape & Roadmap 2026](../research/agentic-debug-loop-deep-research-2-2026.md)

The research identifies discoverability and cross-tool integration as the highest-leverage gaps. The agent only benefits from TracePulse if it knows to call the tools. Hooks are the highest-leverage discoverability mechanism.

| # | Feature | Effort | Impact | Research Ref |
|---|---------|--------|--------|-------------|
| 1 | Claude Code PostToolUse hook (auto-check errors after edits) | 1 week | HIGH | 5.2 |
| 2 | Kiro hooks pack (pre/post tool use) | 3 days | HIGH | 5.2 |
| 3 | Tool description token audit (stay under 1K tokens) | 2 days | HIGH | 7.7 |
| 4 | verify_fix with claim-checking (prior fingerprint gone?) | 1 week | HIGH | 5.3, 6.1 |
| 5 | Unified `check_drift()` tool (env + deps + migrations) | 2 weeks | HIGH | 5.8 |
| 6 | Cursor rules file (`tracepulse.cursor-rules.json`) | 2 days | Medium | 5.2 |
| 7 | Dynamic toolsets for less-frequent tools | 1 week | Medium | 7.7 |
| 8 | ViewGraph routing hints in empty responses (`suggested_next` field) | 2 days | Medium | [Design](../engineering/designs/viewgraph-handover.md) |
| 9 | Read Kiro steering files (tech.md) for project-aware defaults | 3 days | Medium | [Design](../engineering/designs/kiro-steering-integration.md) |

## M24: DevLoop Agent — Cross-Layer Correlation (In Progress)

Source: [Idea doc](../ideas/devloop-agent-cross-layer-correlation.md) | [Spec](../../.kiro/specs/devloop-agent/)

Correlates signals across all layers (backend, frontend, git, process, build) to produce single actionable diagnoses. Eliminates the "call 3 tools and guess which layer is broken" pattern.

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | Signal aggregator (collect from all layers into unified buffer) | 2 days | Foundation |
| 2 | Pattern library (7 known cross-layer failure signatures) | 1 day | HIGH |
| 3 | Correlation matcher (match signals against patterns) | 2 days | HIGH |
| 4 | `get_cross_layer_diagnosis` MCP tool | 1 day | HIGH |

## M23: `tracepulse init` - Context-Aware Setup

Source: Agent feedback (skill discoverability gap across MCP clients)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | `tracepulse init` — detect project type, write MCP config | Done | HIGH |
| 2 | `tracepulse init --kiro` — install steering files + hooks to `.kiro/` | Done | HIGH |
| 3 | `tracepulse init --claude` — copy rules to `~/.claude/rules/tracepulse.md` | 2 hours | HIGH |
| 4 | `tracepulse init --cursor` — write `.cursor/rules/tracepulse.md` | 2 hours | Medium |
| 5 | Detect companion MCPs (ViewGraph, Chrome DevTools) and generate combined skills | 1 day | Medium |

## M25: Agent Compliance & Self-Correction

Source: Agent feedback log (5+ sessions of shell fallback, verify_mcp bypass, session-start skip)

The #1 product problem is agents using shell for commands TracePulse handles better. This milestone addresses enforcement, self-correction, and passive detection.

| # | Feature | Effort | Impact | Source |
|---|---------|--------|--------|--------|
| 1 | **Kiro shell-intercept hook** — postToolUse on shell, nudges toward TP tools | Done | HIGH | Feedback 2026-05-19 |
| 2 | **Claude session-start mandate** — `get_project_health()` first rule in rules file | Done | HIGH | Feedback 2026-05-19 |
| 3 | **`tracepulse init --claude`** — auto-install rules to `~/.claude/rules/` | 2 hours | HIGH | Feedback 2026-05-15 |
| 4 | **Missed-opportunity detection in `get_session_insights`** — infer shell usage from absence of expected TP calls | 1 day | HIGH | Feedback 2026-05-19 |
| 5 | **`stop_server` wired to process kill** — onStopRequest callback | 🔲 Open ([BUG-020](../bugs/BUG-020-stop-server-does-not-kill-process.md)) | HIGH | Feedback 2026-05-18 |
| 6 | **`kill_process(pattern, signal?)`** — kill externally-managed processes by name | 1 day | Medium | Feedback 2026-05-18 |
| 7 | **run_and_watch env var prefix stripping** — `PYTHONPATH=src uv run pytest` accepted | Done | HIGH | Feedback 2026-05-18 |
| 8 | **Error escalation** — auto-escalate errors that accumulate without acknowledgment | 2 days | Medium | Wishlist #31 |
| 9 | **HMR details in verify_fix + watch_for_errors** — `files_changed` list in response | 🔲 Open ([FR](../feature-requests/FR-watch-for-errors-files-changed.md)) | Medium | Wishlist #18 |
| 10 | **Quick-check composite** — instant build errors + last HMR + last error (no blocking) | 1 day | Medium | Wishlist #20 |
| 11 | **`start_server` port pre-check** — detect EADDRINUSE before spawning, return structured hint | 🔲 Open ([BUG-021](../bugs/BUG-021-start-server-port-in-use-not-detected.md)) | Medium | Feedback 2026-05-15 |
| 12 | **`get_build_errors` `last_build_at` timestamp** — parse "compiled successfully" line, expose separately from buffer metadata | 🔲 Open ([FR](../feature-requests/FR-get-build-errors-last-build-at.md)) | Medium | Feedback 2026-04-28 |
| 13 | **`run_and_watch` timeout recovery message** — tell agent to use `timeout_seconds: 120` instead of abandoning tool | 🔲 Open ([FR](../feature-requests/FR-run-and-watch-timeout-guidance.md)) | Medium | Feedback 2026-05-16 |
| 14 | **High-signal error pinning** — persist full event for signal_score ≥ 80 in FingerprintHistory so `get_error_context` survives buffer eviction | 🔲 Open ([FR](../feature-requests/FR-high-signal-error-pinning.md)) | Medium | Feedback 2026-04-28 |
| 15 | **`get_new_errors` `since` timestamp filter** — time-window scoping for smoke test workflows | ✅ Done (v0.9.25) | Medium | Feedback 2026-06-05 |

### Unaddressed Wishlists (from feedback log)

| Wishlist | Description | Priority | Effort |
|----------|-------------|----------|--------|
| #27 | Test runner summary parsing (pass/fail/warning counts as top-level fields) | Medium | 1 day |
| #29 | Auto-correlate errors with recent file edits (post-HMR) | Medium | 2 days |
| #31 | Auto-escalate unacknowledged accumulating errors | Medium | 2 days |

### From Deep Research (not yet on any milestone)

| Feature | Research Ref | Priority | Effort |
|---------|-------------|----------|--------|
| `verify_loop(claim, since)` — composite verify with confidence score | §6.1 | HIGH | 1 week |
| `get_prompt_context(error_id)` — pre-assembled reasoning packet | §6.8 | Medium | 1 week |
| Per-fingerprint anomaly detection (occurrence-rate baselines) | §5.7 | Medium | 2 weeks |
| Inactivity detector — "no activity after file change" suggests restart | Untracked | Low | 2 days |
| Stdin pipe mode — `tail -f | tracepulse pipe` | Untracked | Low | 1 week |
| CI output parsing (GitHub Actions, GitLab CI) | Untracked | Low | 1 week |

## M26: Intelligent Feedback (~5 weeks)

Source: Deep Research §5.7, §6.1, §6.8 | Feedback Wishlists #27, #29 | Untracked Ideas
**Spec:** [`.kiro/specs/m26-intelligent-feedback/`](../../.kiro/specs/m26-intelligent-feedback/)

Moves TracePulse from "passive error reporter" to "active debugging intelligence." Each feature reduces tool calls needed to diagnose and verify.

| # | Feature | Effort | Impact | Source |
|---|---------|--------|--------|--------|
| 1 | **Test runner summary parsing** — structured pass/fail/skip counts from pytest/vitest/jest/go/cargo | 1 day | HIGH | Wishlist #27 |
| 2 | **Auto-correlate errors with file edits** — new fingerprints auto-linked to recent changes | 2 days | HIGH | Wishlist #29 |
| 3 | **`verify_loop(claim, since)`** — composite verify with confidence score (collapses 5-7 calls → 1) | 1 week | HIGH | §6.1 |
| 4 | **`get_prompt_context(fingerprint)`** — pre-assembled, token-budgeted reasoning packet | 1 week | Medium | §6.8 |
| 5 | **Per-fingerprint anomaly detection** — 3x baseline spike → auto-flag | 2 weeks | Medium | §5.7 |
| 6 | **Stdin pipe mode + CI parsers** — `tracepulse pipe` + GitHub Actions/GitLab CI parsing | 1 week | Medium | Untracked |

## M27: Effectiveness Telemetry (~3 weeks)

Source: Consumer project field usage (feedback loop steering), shell-misuse enforcement patterns
**Spec:** [`.kiro/specs/m27-effectiveness-telemetry/`](../../.kiro/specs/m27-effectiveness-telemetry/)
**Ticket:** TRP-7, TRP-8

Persistent cross-session telemetry that answers: "Is TracePulse actually helping?" Captures efficiency metrics, surfaces parser gaps, and generates data-driven steering.

| # | Feature | Effort | Impact | Source |
|---|---------|--------|--------|--------|
| 1 | **Session effectiveness summary** — persist investigation/fix/misuse counts to `.tracepulse/telemetry.json` | 2 days | HIGH | Consumer project feedback loop |
| 2 | **`get_effectiveness_report` tool** — cumulative metrics: savings_ratio, fix_rate, parser coverage | 2 days | HIGH | TRP-7 |
| 3 | **Parser gap accumulator** — surface unmatched log patterns for parser development | 1 day | Medium | Field observation |
| 4 | **Timeout guidance feedback** — P95-based `timeout_seconds` recommendations from actual data | 1 day | HIGH | TRP-6, field data |
| 5 | **Efficiency delta metrics** — tokens saved, mean_time_to_fix, savings_ratio, energy/CO2/USD cumulative | 3 days | HIGH | ROI measurement |
| 6 | **Effectiveness steering auto-generation** — `tracepulse init` produces data-driven `tracepulse-tuning.md` | 2 days | Medium | TRP-7 |

## M28: Safe Agent Command Execution (Security)

**Spec:** [`.kiro/specs/m28-safe-command-execution/`](../../.kiro/specs/m28-safe-command-execution/)
**Origin:** v0.9.31 STRIDE threat model — [`docs/audits/security/THREAT_MODEL.md`](../audits/security/THREAT_MODEL.md) §6.5 · Design ticket TRP-53.

Complements M25 (agents should use TracePulse's routes, not raw shell) by making that routing **safe**. TracePulse is
the instrumented command-execution chokepoint by design; this milestone uses that chokepoint to add containment and
sanitization that raw shell never had — **without removing any agent capability**:

- **Contain:** scrub the child env (stop inheriting full `process.env` — defeats the `bash -c env` secret harvest;
  TRP-55) and confine `cwd` to the project root (TRP-57).
- **Sanitize:** redact **all** returned output incl. `raw_output` (TRP-54) and label output as untrusted (TRP-58).
- **Govern:** reframe the ever-growing allowlist from a *gate* into a *classifier* — Green (auto/instrumented, the
  95% fast path), Amber (escape hatch: runs, confirm-once then session-remember), Red (contain/confirm); apply the
  same guardrail to `verify_mcp`/`start_server` (TRP-56); optional sandbox backend (TRP-59).
- **Position:** document the net-new safety as a product differentiator in README + GitBook (TRP-60).

Near-term (Contain + Sanitize + parity) lands in v0.9.31; the classifier + sandbox are the follow-on milestone.

---

## M14: Category Extension (informed by Deep Research)

These features move TracePulse from "backend log MCP" to "agentic debug primitive."

| # | Feature | Effort | Impact | Research Ref |
|---|---------|--------|--------|-------------|
| 1 | Cross-environment fingerprint correlation + Sentry export | 2-3 weeks | HIGH | 6.3 |
| 2 | DAP-MCP companion package (`tracepulse-debug`) | 4-6 weeks | HIGH | 5.1, 4.4 |
| 3 | Developer-facing dashboard (`tracepulse view`) | 1-2 weeks | HIGH | 5.6 |
| 4 | Multi-agent observability (per-agent filtering, conflict detection) | 2 weeks | HIGH | 5.5 |
| 5 | HTTP record-replay sidecar | 2-3 weeks | Medium | 6.2 |
| 6 | V8 Inspector integration for Node JIT-instrumentation | 4-6 weeks | HIGH | 6.7 |
| 7 | AST-aware diff correlation (tree-sitter) | 2-3 weeks | Medium | 6.9 |

## M15: Tool Schema Optimization (informed by MCP Tooling Research)

Source: [MCP Tooling Research](../research/mcp-tooling-research--the-case-for-rearchitecting-tracepulse-and-viewgraph.md) | [Spec](../../.kiro/specs/m15-tool-schema-optimization/)

30 tool schemas = ~6,000 tokens overhead per turn. Research shows 90%+ reduction achievable.

| # | Feature | Effort | Impact | Research Ref |
|---|---------|--------|--------|-------------|
| 1 | Tool description compression (remove "tool smells") | 1 day | 25-35% per schema | arXiv 2602.14878 |
| 2 | Tool clustering (5 clusters, progressive disclosure) | 2 weeks | 83% schema reduction | Speakeasy, arXiv 2603.20313 |
| 3 | Token audit in get_audit_trail (cost per call) | 3 days | Transparency | Internal |
| 4 | Efficiency summary (tokens saved, cost, carbon) | 2 days | Marketing metric | IEA, Goldman Sachs |

## M16: Platform Coverage Expansion (informed by Platform Strategy Research)

Source: [Platform Strategy Research](../research/viewgraph-tracepulse-v1-platform-strategy.md) | [Spec](../../.kiro/specs/m16-platform-coverage/)

Python is the #1 growth language. Go is TIOBE's fastest climber. pnpm/Bun are replacing npm. Monorepos are the enterprise default.

| # | Feature | Effort | Impact | Justification |
|---|---------|--------|--------|---------------|
| 1 | Pydantic validation error parser | 1 day | HIGH | FastAPI's most common error. Every AI team building APIs hits these. |
| 2 | Go `air` hot-reload detection | 1 hour | Medium | Trust erosion without it (same as uvicorn before we added patterns) |
| 3 | pnpm/Bun/uv documentation | 2 hours | Medium | Modern stacks don't use npm. Not documenting = invisible support. |
| 4 | Spring Boot error parser enhancement | 1 day | Medium | Enterprise Java default. Pairs with Angular frontend story. |
| 5 | Monorepo child-process routing (Turbo/Nx) | 1-2 weeks | HIGH | Enterprise topology. Without it, agent can't tell which package errored. |
| 6 | `uv run` in allowlist | 30 min | Low | Python's fastest-growing PM. Signals ecosystem awareness. |

## Strategic Positioning (from Deep Research)

## M17: Token Savings Wave 1 - Quick Wins (from Advanced Token Research)

Source: [Advanced Token Savings Research](../research/tracepulse-advanced-token-savings-research.md) | [Spec](../../.kiro/specs/m17-token-wave1/)

Zero external dependencies. ~21,300 tokens/session saved on top of existing 90.6% baseline.

| # | Feature | Savings | Effort | Research Dimension |
|---|---------|---------|--------|-------------------|
| 1 | Acknowledged errors (exclude investigated from get_errors) | ~9,000 tokens/session | 2 days | D5 |
| 2 | No-change delta responses (return 20 tokens vs 1,000) | ~4,900 tokens/session | 1 day | D1 |
| 3 | Stack trace frame filtering (strip framework frames) | ~1,600 tokens/session | 1 day | D7 |
| 4 | Error message abbreviation (10-pattern table) | ~800 tokens/session | 1 day | D7 |
| 5 | token_budget + verbosity parameters on all tools | 2-5x control | 2 days | D9 |
| 6 | Loop detection injection (break stuck loops) | ~5,000 tokens/session | 1 day | D5 |
| 7 | Environmental report tool (get_session_impact) | Reporting | 1 day | D12 |

## M18: Token Savings Wave 2 - Medium Effort (from Advanced Token Research)

Source: [Advanced Token Savings Research](../research/tracepulse-advanced-token-savings-research.md) | [Spec](../../.kiro/specs/m18-token-wave2/)

Minor dependencies (MCP Streamable HTTP, background workers). ~15,350 tokens/session saved.

| # | Feature | Savings | Effort | Research Dimension |
|---|---------|---------|--------|-------------------|
| 1 | SSE push transport (eliminate polling) | ~5,550 tokens/session | 2 weeks | D2 |
| 2 | Session summary tool (200-token compressed manifest) | ~5,000 tokens/session | 3 days | D4 |
| 3 | Session briefing tool (background worker) | ~2,600 tokens/session | 1 week | D10 |
| 4 | Pre-computed diff correlation (auto on HMR) | ~1,700 tokens/session | 3 days | D8 |
| 5 | Compaction-friendly field names | 10-20% size | 2 days | D4 |
| 6 | Semantic error grouping (file:line dedup) | ~500 tokens/session | 2 days | D7 |

## Strategic Positioning (from Deep Research)

- **Coexistence, not competition:** "TracePulse for local dev, Lightrun for prod, Sentry for production monitoring"
- **The drift detection layer:** No tool currently brands itself as "the drift detection layer for agentic coding" - unclaimed category
- **Connective tissue:** TracePulse + Sentry + Replay + Lightrun + Chrome DevTools MCP form a stack where each covers a different stage
- **The trust gap:** "Agents that verify their own work ship faster, break less, require fewer human review cycles"
- **Window:** "One product cycle away from being either the indispensable backend layer or a feature absorbed by Cursor/Lightrun/Sentry"

## M7: Agent-Driven Enhancements

Features driven by real agent feedback (Nexus) and competitive research (CyberAgent, BrowserTools, Sentry).

**Spec:** [`.kiro/specs/m7-agent-enhancements/`](../../.kiro/specs/m7-agent-enhancements/)
- [requirements.md](../../.kiro/specs/m7-agent-enhancements/requirements.md) - 10 user stories
- [design.md](../../.kiro/specs/m7-agent-enhancements/design.md) - data flows, parser designs, file changes
- [tasks.md](../../.kiro/specs/m7-agent-enhancements/tasks.md) - 35 TDD tasks across 10 phases

| Sub-milestone | Version | Key Features | Effort |
|---------------|---------|-------------|--------|
| **M7a** | v0.7.0 | Multi-file attach mode, HTTP access log parser (uvicorn/express/nginx), `status_code_min` filter | Medium |
| **M7b** | v0.7.1 | Pytest parser, Jest parser, test runner skill | Medium |
| **M7c** | v0.7.2 | Audit endpoints skill, debugger mode skill, GitHub issue skill, `last_event_timestamp` | Low |

## M8: Dev Infrastructure Awareness

Detect infrastructure issues from the existing log stream. No new data sources - smarter parsing and pattern detection.

**Spec:** [`.kiro/specs/m8-infra-awareness/`](../../.kiro/specs/m8-infra-awareness/)
- [requirements.md](../../.kiro/specs/m8-infra-awareness/requirements.md) - 6 features with design
- [tasks.md](../../.kiro/specs/m8-infra-awareness/tasks.md) - 20 tasks across 5 phases

| Feature | Effort | Impact |
|---------|--------|--------|
| Crash loop detection (3+ restarts in 60s) | Low | HIGH |
| Slow request alerting (duration > 1s) | Low | HIGH |
| Infrastructure error patterns (connection refused, OOM, pool exhausted) | Low | HIGH |
| Database migration parser (alembic, Django) | Low | Medium |
| Environment validation (.env.example check) | Low | Medium |
| Health endpoint probing (periodic GET /health) | Medium | Medium |

**Design patterns:** Log-based anomaly detection, sliding window counters, threshold-based alerting, startup validation.

## M-Harden: Code Quality & Hardening ✅ COMPLETE

All 13 findings from CRR-001 (2026-04-30) resolved in v0.9.2.

**Review:** [do../audits/code-review/CRR-001-2026-04-30-full-review.md](../audits/code-review/CRR-001-2026-04-30-full-review.md)

- [x] **TD-008** - Config loader JSON.parse try/catch
- [x] **TD-009** - Secret redactor quoted value capture
- [x] **TD-010** - Process spawner rejects any non-zero exit
- [x] **TD-011** - O(1) pinned error eviction
- [x] **TD-012** - Health prober timedOut flag
- [x] **TD-013** - Typed createNoOpInfraMonitor()
- [x] **TD-014** - Config validator rejects unknown keys
- [x] **TD-015** - Log tailer surfaces non-ENOENT errors
- [x] **TD-016** - Fingerprinter LRU cache
- [x] **TD-017** - GCP/Azure/Datadog secret patterns (16 total)
- [x] **TD-018** - Multi-process exit-race guard
- [x] **TD-019** - Friendly EADDRINUSE error
- [x] **TD-020** - Proportional rate limiter

---

## M6: Stable Release - Remaining Work

- [x] Wire `get_errors` response as structured object (TD-001) — already returns structured JSON with metadata
- [x] Fix multi-process service name tagging (TD-003) — events tagged via onLine callback
- [x] Always register all tools with helpful messages when deps missing (TD-002) — Layer 2 tool disabling in standalone mode
- [x] Fix `hot_reload_detected` to return `null` in attach mode (TD-006)
- [x] Add HMR event details to watch result (TD-007) — HmrEvent interface with tool/pattern_id/timestamp
- [x] Migrate ESLint to v9 flat config (TD-004) — eslint.config.js with tseslint.config()
- [x] Fix intermittent multi-process test (TD-005) — passing reliably (13s, process-based)
- [x] Complete M-Harden milestone (TD-008 through TD-020)
- [ ] Full test coverage audit (target ≥80%)
- [ ] Performance benchmarks
- [ ] npm publish (`npx tracepulse`)
- [ ] GitHub release with changelog

## Post-v1.0 - Agent-Driven Improvements

Items identified from real agent feedback during Nexus testing.
See `docs/feedback/feature-request-analysis-session3.md` for full analysis of session 3 requests.

### Quick Wins (pre-v1.0 candidates)

- [x] **Investigate structlog JSON parsing** — JSON log parser handles structlog format
- [x] **Add `message_contains` filter** to `get_errors` and `get_server_logs` — implemented with case-insensitive substring match
- [ ] **Update SKILL.md** - teach agent to use `since` param as a cursor, and to bridge FE errors manually via Chrome DevTools MCP
- [x] **Multi-file attach mode** — `tracepulse attach --log-file backend=./backend.log --log-file frontend=./frontend.log`. Implemented in M7a.

### Attach Mode Visibility

**Problem:** In attach mode, TracePulse tails one log file but can't see other processes. When frontend (Vite) and backend (Python) are separate, `hot_reload_detected` is blind to frontend HMR.

**Long-term fix:** Support multiple log files in attach mode:
```bash
tracepulse attach --log-file ./backend.log --log-file ./frontend.log
```
Or auto-discover log files from a directory:
```bash
tracepulse attach --log-dir ./logs/
```
Each file tagged with a service name derived from the filename. This gives attach mode the same multi-process visibility as start mode without needing to spawn processes.

### Multi-Log Attach Mode

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "node",
      "args": [
        "/path/to/tracepulse/dist/cli.js",
        "attach",
        "--log-file", "backend=./logs/backend.log",
        "--log-file", "frontend=./logs/frontend.log"
      ]
    }
  }
}
```

### Composite Smoke Test Tool

Agent feedback: "I do navigate → check console → check network → pass/fail in 3-4 separate calls. A single tool would help."

Not TracePulse scope alone (needs Chrome DevTools MCP), but could be a composite skill or a meta-tool that orchestrates multiple MCP servers.

### Type Checking Integration

Agent feedback: "A tool that runs `tsc --noEmit` and returns type errors."

Option: Add a `run_typecheck` tool that executes `tsc --noEmit` and parses the output through the TypeScript compiler parser. Low effort, high value.

### Request Tracking Buffer

Agent feedback: "I need `get_requests(path="/export", limit=5)` returning method, status, duration."

Parse HTTP access log lines into structured request objects. New data model alongside RuntimeEvent. Medium effort, high value for API debugging.

### Health Probe

Agent feedback: "Process is running but is it healthy? Periodic GET /health probe surfaced in get_runtime_status."

Background task that pings a configurable endpoint. Low effort, nice-to-have.

### Auto CDP Bridge

Agent feedback: "`get_correlated_errors` always returns empty because no browser source feeds the frontend buffer."

Auto-connect to Chrome via CDP and capture failed network requests. This is the Phase 4 CDP listener - designed but not wired. High effort, high value.

### Test Runner Integration

Agent feedback: "Test failures are a major error source but TP doesn't capture them."

New pytest/jest parser that understands PASSED/FAILED/ERROR summary lines. Medium effort, high value.

### Background Task Management

Agent research (2026-04-29): 6 categories of background state agents can't see.
See `docs/ideas/agent-background-task-gaps.md` for full analysis.

**Immediate (SKILL.md only):**
- Language-specific command reference (Node, Python, Go, Rust, Java)
- Dependency check workflow via `run_and_watch`
- Migration status workflow via `run_and_watch`
- Security audit workflow via `run_and_watch`

**New parsers:**
- npm audit JSON parser (vulnerability counts)
- Coverage output parser (line/branch/function %)
- npm outdated parser (outdated dependency table)

**New tools:**
- `check_port(port)` - verify port availability
- `get_dependency_status()` - installed vs required deps
- `get_project_health()` - composite health check (deps + env + db + server + tests)

### Log Ingestion Flexibility (post-v1.0 sequence)

See `docs/ideas/log-ingestion-flexibility.md` for full technical designs.

| # | Feature | Effort | Depends on |
|---|---------|--------|------------|
| 1 | Multi-file attach mode | Low | Nothing (quick win, pre-v1.0) |
| 2 | Stdin pipe mode | Low | HTTP transport |
| 3 | Log directory watching | Medium | #1 |
| 4 | Combined start + attach | Low | #1 |
| 5 | HTTP log ingestion (expand) | Low | Already built |

## Code Reviews

| Review | Date | Scope | Report |
|--------|------|-------|--------|
| SRR-001 | 2026-04-29 | T2 security — full codebase (v0.8.0) | [Report](../audits/security/SRR-001-2026-04-29-T2.md) |
| SRR-002 | 2026-04-29 | T2 security — post-M9/M10/M11 (v0.9.2) | [Report](../audits/security/SRR-002-2026-04-29-T2.md) |
| CRR-001 | 2026-04-30 | Full review — security, performance, maintainability, edge cases (v0.9.2) | [Report](../audits/code-review/CRR-001-2026-04-30-full-review.md) |
| SRR-003 | 2026-04-30 | T3 security — full codebase sprint-end (v0.9.2) | [Report](../audits/security/SRR-003-2026-04-30-T3.md) |
| SRR-004 | 2026-05-01 | T3 security — post-M13/M16 features (v0.9.3) | [Report](../audits/security/SRR-004-2026-05-01-T3.md) |
| MRR-001 | 2026-04-30 | Maintainability — full codebase (v0.9.2) | [Report](../audits/maintainability/MRR-001-2026-04-30.md) |
| MRR-002 | 2026-05-01 | Maintainability — new M13/M16 code (v0.9.3) | [Report](../audits/maintainability/MRR-002-2026-05-01.md) |
| TQR-001 | 2026-04-30 | Test quality — 722 tests across 77 files (v0.9.2) | [Report](../audits/test-quality/TQR-001-2026-04-30.md) |
| TQR-002 | 2026-05-01 | Test quality — 731 tests across 79 files (v0.9.3) | [Report](../audits/test-quality/TQR-002-2026-05-01.md) |
| DRR-001 | 2026-04-30 | Dependency risk — package.json + transitive deps (v0.9.2) | [Report](../audits/dependencies/DRR-001-2026-04-30.md) |
| DRR-002 | 2026-05-01 | Dependency risk — zod resolved, eslint open (v0.9.3) | [Report](../audits/dependencies/DRR-002-2026-05-01.md) |

## ADRs

| ADR | Decision | Date |
|-----|----------|------|
| [ADR-001](../decisions/ADR-001-tech-stack.md) | Tech Stack & Architecture | 2026-04-27 |

## Feedback Log

See [docs/feedback/agent-feedback-log.md](../feedback/agent-feedback-log.md) for real-world agent feedback driving roadmap priorities.

## Technical Debt

See [docs/technical-debt/TECH-DEBT.md](../technical-debt/TECH-DEBT.md) for known shortcuts and items to fix.
