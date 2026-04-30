# Project Roadmap

## Current Version

v0.9.2 (alpha - 30 MCP tools, 23 parsers, 709 tests)

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
| M13: Discoverability & Integration | Deep Research | v0.9.3 | 🔲 Next |
| M14: Category Extension | Deep Research | v0.9.4-v1.0 | 🔲 Planned |
| M6: Stable Release | Release | v1.0.0 | 🔲 Planned |

---

## M13: Discoverability & Integration (Next - informed by Deep Research 2026-04-30)

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

## Strategic Positioning (from Deep Research)

- **Coexistence, not competition:** "TracePulse for local dev, Lightrun for prod, Sentry for production monitoring"
- **The drift detection layer:** No tool currently brands itself as "the drift detection layer for agentic coding" - unclaimed category
- **Connective tissue:** TracePulse + Sentry + Replay + Lightrun + Chrome DevTools MCP form a stack where each covers a different stage
- **The trust gap:** "Agents that verify their own work ship faster, break less, require fewer human review cycles"
- **Window:** "One product cycle away from being either the indispensable backend layer or a feature absorbed by Cursor/Lightrun/Sentry"

## M7: Agent-Driven Enhancements

Features driven by real agent feedback (Acme App) and competitive research (CyberAgent, BrowserTools, Sentry).

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

**Review:** [docs/reviews/CRR-001-2026-04-30-full-review.md](../reviews/CRR-001-2026-04-30-full-review.md)

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

- [ ] Wire `get_errors` response as structured object (TD-001)
- [ ] Fix multi-process service name tagging (TD-003)
- [ ] Always register all tools with helpful messages when deps missing (TD-002)
- [ ] Fix `hot_reload_detected` to return `null` in attach mode (TD-006)
- [ ] Add HMR event details to watch result (TD-007)
- [ ] Migrate ESLint to v9 flat config (TD-004)
- [ ] Fix intermittent multi-process test (TD-005)
- [ ] Complete M-Harden milestone (TD-008 through TD-020)
- [ ] Full test coverage audit (target ≥80%)
- [ ] Performance benchmarks
- [ ] npm publish (`npx tracepulse`)
- [ ] Tier 3 security review
- [ ] GitHub release with changelog

## Post-v1.0 - Agent-Driven Improvements

Items identified from real agent feedback during Acme App testing.
See `docs/feedback/feature-request-analysis-session3.md` for full analysis of session 3 requests.

### Quick Wins (pre-v1.0 candidates)

- [ ] **Investigate structlog JSON parsing** - Agent reports all events as `level: "info"`. JSON log parser exists but may not match structlog format. Highest ROI fix.
- [ ] **Add `message_contains` filter** to `get_errors` and `get_server_logs` - enables path/URL filtering without a new tool
- [ ] **Update SKILL.md** - teach agent to use `since` param as a cursor, and to bridge FE errors manually via Chrome DevTools MCP
- [ ] **Multi-file attach mode** - `tracepulse attach --log-file backend=./backend.log --log-file frontend=./frontend.log`. Solves the #1 agent pain point. See `docs/ideas/log-ingestion-flexibility.md` #1.

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
| SRR-001 | 2026-04-29 | T2 security — full codebase (v0.8.0) | [Report](../security/SRR-001-2026-04-29-T2.md) |
| SRR-002 | 2026-04-29 | T2 security — post-M9/M10/M11 (v0.9.2) | [Report](../security/SRR-002-2026-04-29-T2.md) |
| CRR-001 | 2026-04-30 | Full review — security, performance, maintainability, edge cases (v0.9.2) | [Report](../reviews/CRR-001-2026-04-30-full-review.md) |

## ADRs

| ADR | Decision | Date |
|-----|----------|------|
| [ADR-001](../decisions/ADR-001-tech-stack.md) | Tech Stack & Architecture | 2026-04-27 |

## Feedback Log

See [docs/feedback/agent-feedback-log.md](../feedback/agent-feedback-log.md) for real-world agent feedback driving roadmap priorities.

## Technical Debt

See [docs/technical-debt/TECH-DEBT.md](../technical-debt/TECH-DEBT.md) for known shortcuts and items to fix.
