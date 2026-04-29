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
| M7a: Multi-File Attach + Filters | Agent Feedback | v0.7.0 | ✅ Complete |
| M7b: Test Runner Integration | Agent Feedback | v0.7.1 | ✅ Complete |
| M7c: Agent Workflow Skills | Competitive Research | v0.7.2 | ✅ Complete |
| M8: Dev Infrastructure Awareness | Agent Feedback + Research | v0.8.0 | ✅ Complete |
| M9: Infrastructure Discovery & Health | Research | v0.9.0 | ✅ Complete |
| M10: Project Health & Dependency Awareness | Gap Analysis | v0.9.1 | ✅ Complete |
| M11: Agent Workflow Intelligence | Agent Feedback | v0.9.2 | ✅ Complete |
| M12: Ecosystem Research Features | Research | v0.9.3-v1.0 | 🔲 Not Started |
| M-Harden: Code Quality & Hardening | CRR-001 | v0.9.4 | 🔲 Not Started |
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

## M-Harden: Code Quality & Hardening

Findings from CRR-001 (2026-04-30) full codebase review. Addresses security gaps, correctness bugs, performance hot paths, and type safety. Should complete before M6 Stable Release.

**Review:** [docs/reviews/CRR-001-2026-04-30-full-review.md](../reviews/CRR-001-2026-04-30-full-review.md)

### Fix Now — Pre-Release Blockers

- [ ] **TD-008** — Wrap `JSON.parse` in `loadConfig()` with try/catch; return validation error on malformed config file (`src/config/config-loader.ts:80,84`)
- [ ] **TD-009** — Fix `key-value-secret` redaction pattern to capture quoted values (`src/constants/redaction.ts:62`)
- [ ] **TD-010** — Reject `start()` on any non-zero early exit, not just code 127 (`src/collectors/process-spawner.ts:131,164`)

### High Priority

- [ ] **TD-011** — Replace O(n log n) pinned error eviction sort with insertion-ordered list for O(1) eviction (`src/store/ring-buffer.ts:173`)
- [ ] **TD-012** — Guard health prober error handler with `timedOut` flag to prevent timeout message being overwritten (`src/infra/health-prober.ts:66`)
- [ ] **TD-013** — Extract typed `createNoOpInfraMonitor()` factory; remove `as any` casts in `server.ts` and collector monkey-patch in `cli.ts` (`src/mcp/server.ts:507,518`, `src/cli.ts:451`)

### Medium Priority

- [ ] **TD-014** — Add unknown-key validation to `validateConfig()` (`src/config/config-schema.ts:65`)
- [ ] **TD-015** — Log file tailer: only suppress ENOENT; surface EACCES and other I/O errors to stderr (`src/collectors/log-file-tailer.ts:87`)
- [ ] **TD-016** — Add LRU fingerprint cache to skip SHA-256 + 5 regex passes on duplicate messages (`src/pipeline/fingerprinter.ts:53`)
- [ ] **TD-017** — Add GCP service account, Azure connection string, and Datadog API key redaction patterns (`src/constants/redaction.ts`)

### Low Priority

- [ ] **TD-018** — Check `child.exitCode !== null` before registering exit listener in `stop()` to close the narrow exit-race (`src/collectors/multi-process-collector.ts:115`)
- [ ] **TD-019** — Detect EADDRINUSE in HTTP transport and print actionable suggestion (`src/transport/http-transport.ts:59`)
- [ ] **TD-020** — Replace fixed-window rate limiter with continuous token bucket (`src/correlation/sources/log-collector.ts:65`)

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
