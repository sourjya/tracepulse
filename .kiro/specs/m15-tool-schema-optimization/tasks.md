# M15 Tasks (Updated)

## Phase 1: Shared Parameters (Quick Win, 1 day)
- [ ] 1. Extract shared Zod params (since, limit, source, service, status_code_min) to `src/constants/common-params.ts`
- [ ] 2. Update all tool handlers to import from common-params
- [ ] 3. Measure before/after schema token count
- [ ] 4. Tests: verify all tools still register correctly

## Phase 2: Description Compression (1 day)
- [ ] 5. Audit all 30 tool descriptions for "tool smells"
- [ ] 6. Compress each description to essential info
- [ ] 7. Move examples from schemas to SKILL.md
- [ ] 8. Measure token reduction per schema

## Phase 3: Gateway Infrastructure (3 days)
- [ ] 9. Port gateway.ts from ViewGraph (zero product-specific code)
- [ ] 10. Create cluster-config.json with 7 clusters
- [ ] 11. Add createToolProxy + registerGateways wiring to server.ts
- [ ] 12. Add --clustered CLI flag to cli.ts
- [ ] 13. Add TP_TOOL_MODE env var support

## Phase 4: Cluster Implementation (1 week)
- [ ] 14. Wire all 30 register calls through proxy
- [ ] 15. Implement destructive action guard on tp_manage (confirm=true)
- [ ] 16. Keep run_and_watch + get_requests as standalone (not clustered)
- [ ] 17. Test: flat mode unchanged (all 30 tools)
- [ ] 18. Test: clustered mode (9 tools visible)
- [ ] 19. Test: gateway discovery returns sub-tool listing
- [ ] 20. Test: gateway dispatch routes correctly
- [ ] 21. Test: destructive guard blocks without confirm
- [ ] 22. Test: unregistered tool in config skipped cleanly

## Phase 5: Documentation (2 days)
- [ ] 23. Update SKILL.md with clustered mode guidance
- [ ] 24. Update gitbook with token efficiency metrics
- [ ] 25. Update README with --clustered flag
- [ ] 26. Add token audit to get_audit_trail response
