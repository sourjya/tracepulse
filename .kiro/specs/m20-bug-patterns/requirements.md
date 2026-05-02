# M20: Bug Pattern Detection ("Error Intelligence")

## Agent Instructions

```
GIT: Branch before code, commit after phase, merge after milestone
TDD: RED test first, GREEN implementation
COMMENTS: File-level JSDoc + function JSDoc + inline comments
CHOKEPOINT: Log blockers as CP-### with full format BEFORE moving on
MARKETING: After milestone, update token savings in marketing docs
MERGE: git checkout main && git merge feat/M20-bug-patterns --no-edit && git push origin main && git branch -d feat/M20-bug-patterns
```

## Overview

TracePulse already collects error fingerprints across sessions. This milestone turns that data into actionable intelligence: recurring bugs, error velocity, chains, regressions, flaky errors, and "fixed but came back" patterns.

**CLI:** `tracepulse analyze`
**MCP tool:** `get_bug_patterns()`
**Automatic:** Pattern annotations injected into `get_errors()` responses

## Architecture Decisions

### Persistence as default (opt-out)
Change `--persist` from opt-in to default. New flag: `--no-persist` to disable.
- Disk impact: ~30KB typical, ~750KB max. Local `.tracepulse/` directory.
- Privacy: only hashes + timestamps + truncated messages. No raw stack traces.
- Justification: pattern detection is useless without cross-session data. Making it opt-in means 90% of users never get the feature.

### Continuous injection via get_errors()
When `get_errors()` returns errors that have known patterns, inject a `patterns` field:
```json
{
  "patterns": {
    "recurring": { "sessions": 5, "total_occurrences": 127 },
    "velocity": "increasing",
    "chain": ["ECONNREFUSED also triggers auth_timeout"]
  }
}
```
Cost: ~50 tokens per annotated error. Saves: ~3,000 tokens per avoided re-investigation.

### Dual output: structured + narrative
- MCP tool returns structured JSON (agent consumption)
- CLI prints human-readable narrative (developer consumption)
- `verbosity` parameter controls detail level

## Bug Pattern Taxonomy

Based on testing and debugging research (Atlassian flake detection, Google Testing Blog, Microsoft empirical studies):

### P1: Recurring Errors (highest value)
Same fingerprint appears in 3+ sessions. Indicates an unfixed root cause.
- **Detection:** Count distinct sessions per fingerprint
- **Threshold:** 3+ sessions
- **Action:** "This error has appeared in 5 of your last 7 sessions. Fix the root cause."

### P2: Error Velocity (getting worse)
Occurrence rate increasing over time. The bug is spreading or the trigger is becoming more common.
- **Detection:** Compare occurrence rate (count/session) across last 5 sessions
- **Threshold:** Rate doubled or more
- **Action:** "This error is getting worse: 3/session last week, 12/session this week."

### P3: Error Chains (correlated errors)
Error A always appears within 5 seconds of Error B. Fixing A likely fixes B.
- **Detection:** Temporal correlation within the ring buffer (same session)
- **Threshold:** Co-occurrence in 80%+ of instances
- **Action:** "This error always appears with 'connection pool exhausted'. They share a root cause."

### P4: Regression Detection (new after change)
Fingerprint first appeared after a specific git commit or deploy.
- **Detection:** Cross-reference first_seen with git log timestamps
- **Threshold:** First seen within 1 hour of a commit
- **Action:** "This error first appeared after commit abc123 (2 hours ago)."

### P5: Flaky Errors (intermittent)
Appears in some sessions but not others, with no clear pattern.
- **Detection:** Appears in 20-60% of sessions (not consistent enough to be recurring, not rare enough to be one-off)
- **Threshold:** 20-60% session presence over 5+ sessions
- **Action:** "Intermittent error - likely a race condition or timing issue."

### P6: Fixed But Came Back (regression after fix)
Error was absent for 3+ sessions after being acknowledged/cleared, then reappeared.
- **Detection:** Gap in occurrence history followed by recurrence
- **Threshold:** 3+ clean sessions then reappearance
- **Action:** "This error was fixed but came back. The fix may have been incomplete or reverted."

### P7: Cascading Failures
One high-signal error triggers a cascade of lower-signal errors.
- **Detection:** Burst of 5+ errors within 2 seconds, all with different fingerprints
- **Threshold:** 5+ distinct fingerprints in 2-second window
- **Action:** "These 7 errors are a cascade. Fix the first one (connection refused) and the rest should resolve."

### P8: Silent Degradation
Error count per session is slowly increasing over weeks, even though no single error is alarming.
- **Detection:** Total error count trend across sessions
- **Threshold:** 20%+ increase over 5 sessions
- **Action:** "Overall error rate is increasing. 12 errors/session last week, 18 this week."

## Requirements

### R1: Make persistence default
Change `--persist` to default behavior. Add `--no-persist` flag.
Update CLI help, docs, SKILL.md.

### R2: get_bug_patterns() MCP tool
Returns all detected patterns for the current project:
```json
{
  "patterns": {
    "recurring": [{ "fingerprint": "abc", "sessions": 5, "message": "..." }],
    "velocity": [{ "fingerprint": "def", "rate_change": "+300%", "message": "..." }],
    "chains": [{ "primary": "abc", "secondary": ["def", "ghi"], "confidence": 0.85 }],
    "regressions": [{ "fingerprint": "jkl", "first_seen_after": "commit abc123" }],
    "flaky": [{ "fingerprint": "mno", "presence_rate": 0.4 }],
    "fixed_but_back": [{ "fingerprint": "pqr", "clean_sessions": 4, "recurred_at": "..." }],
    "cascades": [{ "trigger": "abc", "cascade_size": 7 }],
    "degradation": { "trend": "increasing", "rate": "+50% over 5 sessions" }
  },
  "summary": "3 recurring bugs, 1 regression, 1 cascade pattern detected.",
  "top_recommendation": "Fix 'ECONNREFUSED' (recurring, 5 sessions) - it triggers a 7-error cascade."
}
```

### R3: tracepulse analyze CLI command
Human-readable output:
```
TracePulse Bug Pattern Analysis
================================

RECURRING (3 bugs across 5+ sessions):
  1. ECONNREFUSED 127.0.0.1:5432 - 5 sessions, 127 total occurrences
     -> Fix the root cause. This is your #1 token waster.
  2. column "auth_provider" does not exist - 3 sessions, 42 occurrences
     -> Run pending migrations.

VELOCITY (1 bug getting worse):
  1. ValidationError for UserCreate - 3/session -> 12/session (+300%)
     -> Check recent API changes.

CASCADE (1 pattern):
  1. ECONNREFUSED triggers: auth_timeout, session_expired, cache_miss (7 errors)
     -> Fix the connection issue. The cascade will resolve.

Token impact: These patterns cost ~45,000 tokens across 5 sessions.
Fixing the top 2 would save ~$0.28/session.
```

### R4: Pattern injection in get_errors()
When returning errors, check each fingerprint against pattern history. If patterns exist, add a `patterns` field to the error object.

### R5: Session-start briefing
When `get_project_health()` is called and patterns exist, include a `pattern_alert` field:
```json
{
  "pattern_alert": "3 recurring bugs detected. Call get_bug_patterns() for details."
}
```

### R6: Environmental cost per pattern
Each pattern includes estimated token waste:
```json
{
  "token_cost": {
    "total_tokens_wasted": 45000,
    "sessions_affected": 5,
    "estimated_cost_usd": 0.14,
    "energy_wh": 15.3,
    "co2_g": 6.1
  }
}
```
Constants from published research (arXiv 2512.03024, IEA 2025).

## Tasks

### Phase 1: Persistence Default + Data Model
- [ ] 1. RED: Tests for default persistence behavior
- [ ] 2. GREEN: Change --persist to default, add --no-persist
- [ ] 3. RED: Tests for pattern data model
- [ ] 4. GREEN: Implement PatternAnalyzer class with P1-P8 detection

### Phase 2: MCP Tool + CLI
- [ ] 5. RED: Tests for get_bug_patterns tool
- [ ] 6. GREEN: Implement get_bug_patterns with all 8 pattern types
- [ ] 7. RED: Tests for tracepulse analyze CLI output
- [ ] 8. GREEN: Implement CLI analyze subcommand

### Phase 3: Injection + Briefing
- [ ] 9. RED: Tests for pattern injection in get_errors
- [ ] 10. GREEN: Wire pattern annotations into get_errors response
- [ ] 11. RED: Tests for pattern_alert in get_project_health
- [ ] 12. GREEN: Wire pattern alert into get_project_health

### Phase 4: Environmental Cost
- [ ] 13. RED: Tests for per-pattern token cost calculation
- [ ] 14. GREEN: Implement token/energy/CO2 cost per pattern

### Phase 5: Documentation + Marketing
- [ ] 15. Update SKILL.md with get_bug_patterns and analyze command
- [ ] 16. Create gitbook page: features/bug-patterns.md
- [ ] 17. Update marketing docs with pattern detection messaging
- [ ] 18. Update environmental impact SVG with pattern cost data
