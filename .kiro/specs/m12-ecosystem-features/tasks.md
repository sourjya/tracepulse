# M12 Tasks

## Phase 1: Error Intelligence

- [ ] 1. Build error clustering query in `src/tools/get-error-clusters.ts`
- [ ] 2. Register `get_error_clusters` in server.ts
- [ ] 3. Tests for error clustering
- [ ] 4. Build Celery worker parser in `src/parsers/celery-parser.ts`
- [ ] 5. Build Sidekiq worker parser in `src/parsers/sidekiq-parser.ts`
- [ ] 6. Build BullMQ worker parser in `src/parsers/bullmq-parser.ts`
- [ ] 7. Register worker parsers in parser-registry.ts
- [ ] 8. Tests for worker parsers
- [ ] 9. Build `get_migration_status` in `src/tools/get-migration-status.ts`
- [ ] 10. Register `get_migration_status` in server.ts
- [ ] 11. Tests for migration status

## Phase 2: Observability

- [ ] 12. Build audit trail buffer in `src/store/audit-buffer.ts`
- [ ] 13. Build `get_audit_trail` tool in `src/tools/get-audit-trail.ts`
- [ ] 14. Wire audit logging into server.ts tool handlers
- [ ] 15. Tests for audit trail
- [ ] 16. Build perf baseline tracker in `src/store/perf-baseline.ts`
- [ ] 17. Build `get_perf_baseline` tool in `src/tools/get-perf-baseline.ts`
- [ ] 18. Wire HTTP access log events into perf tracker
- [ ] 19. Tests for perf baseline
- [ ] 20. Build error narrative patterns in `src/scoring/error-narratives.ts`
- [ ] 21. Wire narratives into get_error_context response
- [ ] 22. Tests for error narratives

## Phase 3: Verification
- [ ] 23. Update SKILL.md with new tools
- [ ] 24. Update gitbook docs
- [ ] 25. Full test suite + typecheck + build
