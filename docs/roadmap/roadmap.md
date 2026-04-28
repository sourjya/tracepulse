# Project Roadmap

## Current Version

v0.6.0 (alpha - Phases 1–5 complete)

## Milestones

| Milestone | Phase | Version | Status |
|-----------|-------|---------|--------|
| M1: Core Pipeline MVP | Phase 1 | v0.2.0 | ✅ Complete |
| M2: Watch Mode | Phase 2 | v0.3.0 | ✅ Complete |
| M3: Multi-Process & Docker | Phase 3 | v0.4.0 | ✅ Complete |
| M4: Frontend-Backend Correlation | Phase 4 | v0.5.0 | ✅ Complete |
| M5: Proactive Monitoring | Phase 5 | v0.6.0 | ✅ Complete |
| M7a: Multi-File Attach + Filters | Agent Feedback | v0.7.0 | 🔲 Not Started |
| M7b: Test Runner Integration | Agent Feedback | v0.7.1 | 🔲 Not Started |
| M7c: Agent Workflow Skills | Competitive Research | v0.7.2 | 🔲 Not Started |
| M8: Dev Infrastructure Awareness | Agent Feedback + Research | v0.8.0 | 🔲 Not Started |
| M6: Stable Release | Release | v1.0.0 | 🔲 Not Started |

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

## M6: Stable Release - Remaining Work

- [ ] Wire `get_errors` response as structured object (TD-001)
- [ ] Fix multi-process service name tagging (TD-003)
- [ ] Always register all tools with helpful messages when deps missing (TD-002)
- [ ] Fix `hot_reload_detected` to return `null` in attach mode (TD-006)
- [ ] Add HMR event details to watch result (TD-007)
- [ ] Migrate ESLint to v9 flat config (TD-004)
- [ ] Fix intermittent multi-process test (TD-005)
- [ ] Full test coverage audit (target ≥80%)
- [ ] Performance benchmarks
- [ ] npm publish (`npx tracepulse`)
- [ ] Tier 3 security review
- [ ] Maintainability review
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

### Log Ingestion Flexibility (post-v1.0 sequence)

See `docs/ideas/log-ingestion-flexibility.md` for full technical designs.

| # | Feature | Effort | Depends on |
|---|---------|--------|------------|
| 1 | Multi-file attach mode | Low | Nothing (quick win, pre-v1.0) |
| 2 | Stdin pipe mode | Low | HTTP transport |
| 3 | Log directory watching | Medium | #1 |
| 4 | Combined start + attach | Low | #1 |
| 5 | HTTP log ingestion (expand) | Low | Already built |

## Security Reviews

| SRR | Date | Scope | Report |
|-----|------|-------|--------|
| _None yet_ | | | |

## ADRs

| ADR | Decision | Date |
|-----|----------|------|
| [ADR-001](../decisions/ADR-001-tech-stack.md) | Tech Stack & Architecture | 2026-04-27 |

## Feedback Log

See [docs/feedback/agent-feedback-log.md](../feedback/agent-feedback-log.md) for real-world agent feedback driving roadmap priorities.

## Technical Debt

See [docs/technical-debt/TECH-DEBT.md](../technical-debt/TECH-DEBT.md) for known shortcuts and items to fix.
