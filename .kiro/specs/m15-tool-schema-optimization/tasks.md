# M15 Tasks

## Phase 1: Description Compression (Quick Win)
- [ ] 1. Audit all 30 tool descriptions for "tool smells" (redundant phrases, verbose examples)
- [ ] 2. Compress each description to essential info only
- [ ] 3. Move examples from schemas to SKILL.md
- [ ] 4. Measure before/after token count
- [ ] 5. Tests: verify all tools still register correctly

## Phase 2: Tool Clustering
- [ ] 6. Define 5 cluster entry tools with member lists
- [ ] 7. Implement cluster registration in server.ts
- [ ] 8. Each cluster tool returns member schemas on `action: "list"`
- [ ] 9. Member tools registered lazily (only after cluster is expanded)
- [ ] 10. Tests: verify all tools accessible via clusters
- [ ] 11. Measure session-start token overhead (target: 83% reduction)

## Phase 3: Token Audit Extension
- [ ] 12. Add estimated token cost tracking to audit buffer
- [ ] 13. Add `efficiency_summary` to get_audit_trail response
- [ ] 14. Tests for token tracking

## Phase 4: Documentation
- [ ] 15. Update SKILL.md with cluster-based tool discovery
- [ ] 16. Update gitbook with token efficiency metrics
- [ ] 17. Update README with schema optimization claims
