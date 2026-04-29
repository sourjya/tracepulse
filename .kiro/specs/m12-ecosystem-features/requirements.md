# M12: Ecosystem Research Features - Spec

## Status Mapping: Research Items vs Already Built

| Research Item | Already Built? | Notes |
|--------------|:-:|-------|
| T1-A: Env health checker | YES | `validateEnvironment()` on startup + `get_project_health` |
| T1-B: Bulk port checker | PARTIAL | `check_port(port)` exists, needs bulk extension |
| T1-C: Dependency status | NO | New tool needed |
| T1-D: Test runner parsers | YES | pytest, jest, vitest, go test all built |
| T1-E: Error clustering | NO | New query layer needed |
| T2-A: Migration status | PARTIAL | Migration parser exists, needs `get_migration_status` tool |
| T2-B: Crash loop detection | YES | Built in M8 |
| T2-C: Slow request alerting | YES | Built in M8 (>1000ms flagged) |
| T2-D: Background worker parsers | NO | Celery, RQ, Sidekiq, BullMQ |
| T2-E: Why-empty diagnostics | NO | Highest trust ROI |
| T3-A: Schema drift detection | NO | High effort, defer |
| T3-B: Agent action audit trail | NO | New feature |
| T3-C: Parallel conflict detection | NO | New query |
| T3-D: Performance regression baseline | NO | Extends slow request |
| T3-E: Error narrative | NO | Pattern library needed |

## What's Actually New to Build

### Phase 1: Trust & UX (v0.9.1) - highest ROI

- [ ] 1. **Why-empty diagnostics** on all tools returning `[]` - add `diagnostics` field explaining why empty and what to do
- [ ] 2. **Bulk port check** - extend `check_port` to accept array of ports
- [ ] 3. **get_dependency_status** - compare installed vs required (npm/pip)

### Phase 2: Error Intelligence (v0.9.2)

- [ ] 4. **Error clustering** - group related errors by error_type + module path, return cluster summary
- [ ] 5. **Background worker parsers** - Celery task failed/succeeded/timeout patterns
- [ ] 6. **get_migration_status** - run `alembic current` / `prisma migrate status` via run_and_watch, parse result

### Phase 3: Observability (v1.0)

- [ ] 7. **Agent action audit trail** - log every MCP tool call with timestamp, params, response size
- [ ] 8. **Performance regression baseline** - per-endpoint rolling P95 tracker
- [ ] 9. **Error narrative** - pre-formatted fix suggestions for common error patterns

### Phase 4: Advanced (post-v1.0)

- [ ] 10. **Schema drift detection** - compare TS interfaces with API response shapes
- [ ] 11. **Parallel conflict detection** - cross-service file path collision alerts
- [ ] 12. **New SKILL.md decision trees** - project startup, pre-commit, debug blank page, perf investigation
