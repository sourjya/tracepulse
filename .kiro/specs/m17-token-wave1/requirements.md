# M17: Advanced Token Savings - Wave 1 (Quick Wins)

Source: [Advanced Token Savings Research](../../docs/research/tracepulse-advanced-token-savings-research.md)

## Agent Instructions

```
GIT: Branch before code, commit after phase, merge after milestone
TDD: RED test first, GREEN implementation
COMMENTS: File-level JSDoc + function JSDoc + inline comments
CHOKEPOINT: Log blockers as CP-### with full format BEFORE moving on
MARKETING: After milestone, update token savings numbers in docs/marketing/mission-and-positioning.md, gitbook/README.md, and gitbook/why-tracepulse.md
MERGE: git checkout main && git merge feat/M17-token-wave1 --no-edit && git push origin main && git branch -d feat/M17-token-wave1
```

## Overview

7 items, zero external dependencies, ~21,300 tokens/session saved on top of existing 90.6% baseline.

## Requirements

### W1.1: Acknowledged Errors (D5)
**Savings:** ~9,000 tokens/session (3 avoided re-investigations x 3,000 tokens)

New tool: `acknowledge_error(fingerprint)`. Marks an error as "seen" by the agent. `get_errors()` excludes acknowledged fingerprints from results. Agent can still retrieve them via `get_error_context(fingerprint)` explicitly.

Implementation: Set<string> of acknowledged fingerprints in the audit buffer. Filter in handleGetErrors before returning.

### W1.2: No-Change Delta Responses (D1)
**Savings:** ~4,900 tokens/session (5 redundant get_errors calls x 980 tokens)

Track a `last_query_hash` per tool. If the ring buffer hasn't changed since the last call (no new events, no clears), return `{"status": "no_change", "since": <timestamp>}` (~20 tokens) instead of the full response (~1,000 tokens).

Implementation: Hash the buffer's `(size, writePtr, lastBuildAt)` tuple. Compare on each call.

### W1.3: Stack Trace Frame Filtering (D7)
**Savings:** ~1,600 tokens/session (5 errors x 320 tokens per error)

Before returning errors, strip stack trace frames from known framework paths: `node_modules/`, `site-packages/`, `.cargo/registry/`, `java.`, `javax.`, `sun.`. Keep only user-code frames. Reduces a 15-frame stack to 2-3 frames.

Implementation: Filter in the response path (not in the buffer - keep full traces for get_error_context).

### W1.4: Error Message Abbreviation (D7)
**Savings:** ~800 tokens/session

10-pattern abbreviation table applied to error messages in summary views:
- `"TypeError: Cannot read properties of null (reading 'name')"` -> `"null.name TypeError"`
- `"ModuleNotFoundError: No module named 'requests'"` -> `"missing: requests"`
- `"ECONNREFUSED 127.0.0.1:5432"` -> `"postgres down"`

Implementation: Apply only in get_errors summary. Full message preserved in get_error_context.

### W1.5: token_budget + verbosity Parameters (D9)
**Savings:** 2-5x response size control

Add optional `token_budget: number` and `verbosity: 'minimal' | 'standard' | 'full'` to all tools.
- `minimal`: fingerprint + signal_score + error_type only (~50 tokens/error)
- `standard`: current behavior (~200 tokens/error)
- `full`: includes stack trace, fix suggestion, surrounding context (~500 tokens/error)

### W1.6: Loop Detection Injection (D5)
**Savings:** ~5,000 tokens/session (2 loops broken x 5 calls x 500 tokens)

Track `(tool_name, params_hash, result_hash)` in audit buffer. After 3 identical entries, inject `loop_warning` field in next response: "Repeated call detected (3x). Consider: [alternative tool suggestion]."

### W1.7: Environmental Report Tool (D12)
**Savings:** Reporting only

New tool: `get_session_impact()` returning:
```json
{
  "tokens_saved": 121000,
  "energy_saved_wh": 25.7,
  "co2_saved_g": 10.3,
  "equivalent": "3 Google searches"
}
```

Constants: 0.34 Wh per query (ChatGPT avg), 0.4 gCO2e per Wh (US grid avg).

## Tasks

### Phase 1: Acknowledged Errors + Loop Detection (D5)
- [ ] 1. RED: Tests for acknowledge_error tool
- [ ] 2. GREEN: Implement acknowledge_error + filter in get_errors
- [ ] 3. RED: Tests for loop detection
- [ ] 4. GREEN: Implement loop detection in audit buffer
- [ ] 5. Register both in server.ts

### Phase 2: Response Compression (D1, D7)
- [ ] 6. RED: Tests for no-change delta response
- [ ] 7. GREEN: Implement buffer change hash + no_change response
- [ ] 8. RED: Tests for stack frame filtering
- [ ] 9. GREEN: Implement framework frame stripping
- [ ] 10. RED: Tests for message abbreviation
- [ ] 11. GREEN: Implement 10-pattern abbreviation table

### Phase 3: Response Budgeting (D9)
- [ ] 12. RED: Tests for token_budget parameter
- [ ] 13. GREEN: Implement token estimation + truncation
- [ ] 14. RED: Tests for verbosity parameter
- [ ] 15. GREEN: Implement minimal/standard/full modes

### Phase 4: Environmental Report (D12)
- [ ] 16. RED: Tests for get_session_impact
- [ ] 17. GREEN: Implement energy/carbon calculation
- [ ] 18. Register in server.ts

### Phase 5: Documentation
- [ ] 19. Update SKILL.md with new tools and parameters
- [ ] 20. Update gitbook with token savings metrics
- [ ] 21. Update experiments index with new benchmarks
