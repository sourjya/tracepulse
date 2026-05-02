# M18: Advanced Token Savings - Wave 2 (Medium Effort)

Source: [Advanced Token Savings Research](../../docs/research/tracepulse-advanced-token-savings-research.md)

## Agent Instructions

```
GIT: Branch before code, commit after phase, merge after milestone
TDD: RED test first, GREEN implementation
COMMENTS: File-level JSDoc + function JSDoc + inline comments
CHOKEPOINT: Log blockers as CP-### with full format BEFORE moving on
MERGE: git checkout main && git merge feat/M18-token-wave2 --no-edit && git push origin main && git branch -d feat/M18-token-wave2
```

## Overview

6 items, minor dependencies (MCP Streamable HTTP, background workers). ~15,350 tokens/session saved.

## Requirements

### W2.1: SSE Push Transport (D2)
**Savings:** ~5,550 tokens/session (eliminates polling)
**Dependency:** MCP Streamable HTTP transport (spec 2025-11-25, live)

Implement SSE event stream on the HTTP transport. Push events:
- `error_new`: when a new high-signal error appears (signal_score >= 50)
- `build_complete`: when a build/HMR event is detected
- `health_change`: when infrastructure status changes

Agent subscribes once (~100 tokens) instead of polling 5x (~5,000 tokens).

### W2.2: Session Summary Tool (D4)
**Savings:** ~5,000 tokens/session

New tool: `get_session_summary()` returning a ~200-token compressed manifest:
```json
{
  "errors": { "total_seen": 15, "investigated": 8, "fixed": 5, "pending": 2 },
  "builds": { "total": 12, "failed": 1, "last_status": "clean" },
  "tools_called": 45,
  "session_minutes": 120,
  "top_error": "column does not exist (score 95, 42 occurrences)"
}
```

Replaces ad-hoc re-investigation after context compaction.

### W2.3: Session Briefing Tool (D10)
**Savings:** ~2,600 tokens/session

Background worker computes a briefing every 30s. `get_session_briefing()` returns:
- New errors since last briefing
- Resolved errors
- Build status changes
- Performance anomalies

Replaces 4 separate calls (get_errors + get_build_errors + get_infra_status + get_perf_baseline).

### W2.4: Pre-computed Diff Correlation (D8)
**Savings:** ~1,700 tokens/session

Auto-run `correlate_with_diff` on every HMR event (file change detected). Cache result. When agent calls `correlate_with_diff()`, return cached result instantly.

### W2.5: Compaction-Friendly Field Names (D4)
**Savings:** 10-20% response size

Rename verbose fields to short stable keys in a new `compact` response mode:
- `signal_score` -> `ss`
- `fingerprint` -> `fp`
- `occurrence_count` -> `oc`
- `error_type` -> `et`

Maintain backward-compatible aliases. Activated via `verbosity: 'compact'`.

### W2.6: Semantic Error Grouping (D7)
**Savings:** ~500 tokens/session

Group errors sharing the same user-code `file:line` into a parent error with `variant_count`. Instead of 5 separate errors from `auth.py:42`, return 1 error with `variant_count: 5`.

## Tasks

### Phase 1: Session Summary + Briefing (D4, D10)
- [ ] 1. RED: Tests for get_session_summary
- [ ] 2. GREEN: Implement session summary aggregation
- [ ] 3. RED: Tests for get_session_briefing
- [ ] 4. GREEN: Implement background briefing worker
- [ ] 5. Register both in server.ts

### Phase 2: SSE Push Transport (D2)
- [ ] 6. Design: SSE event format and subscription model
- [ ] 7. RED: Tests for SSE event emission
- [ ] 8. GREEN: Implement SSE on HTTP transport
- [ ] 9. Wire error/build/health events to SSE emitter

### Phase 3: Pre-computation + Compression (D8, D4, D7)
- [ ] 10. RED: Tests for auto-correlation on HMR
- [ ] 11. GREEN: Implement HMR-triggered correlation cache
- [ ] 12. RED: Tests for compact field names
- [ ] 13. GREEN: Implement compact response mode
- [ ] 14. RED: Tests for semantic error grouping
- [ ] 15. GREEN: Implement file:line-based grouping

### Phase 4: Documentation
- [ ] 16. Update SKILL.md with new tools
- [ ] 17. Update gitbook with push notification docs
- [ ] 18. Update token savings report with new metrics
