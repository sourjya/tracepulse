# Bug Pattern Detection

TracePulse detects 6 types of cross-session bug patterns from your error history. Patterns are detected automatically and surfaced in three places:

- **`get_bug_patterns()`** - full analysis with all pattern types
- **`get_errors()`** - pattern annotations on individual errors
- **`get_project_health()`** - alert when patterns are detected

## How it works

TracePulse saves a fingerprint summary for each session (which errors appeared, when). On the next session, it loads the history and runs 6 pattern detectors. No raw error messages are stored - only hashes and timestamps.

Persistence is enabled by default. Use `--no-persist` to disable.

## Pattern types

### Recurring errors

Same error appearing in 3+ sessions. Indicates an unfixed root cause that wastes tokens every session.

**Example:** `ECONNREFUSED 127.0.0.1:5432` appearing in 5 of your last 7 sessions.

**Action:** Fix the root cause. This is your #1 token waster.

### Error velocity

Occurrence rate increasing over time. The bug is spreading or the trigger is becoming more common.

**Example:** `ValidationError` went from 3/session to 12/session (+300%).

**Action:** Check recent API changes that might have introduced new validation paths.

### Error chains

Two or more errors that always appear together. Fixing one likely fixes the others.

**Example:** `ECONNREFUSED` always appears with `auth_timeout` and `session_expired`.

**Action:** Fix the connection issue. The cascade will resolve.

### Flaky errors

Errors that appear in 20-60% of sessions with no clear pattern. Likely race conditions or timing issues.

**Example:** `TimeoutError` appears in 40% of sessions.

**Action:** Look for race conditions, missing awaits, or timing-dependent code.

### Fixed but came back

Error was absent for 3+ sessions after being fixed, then reappeared. The fix was incomplete or reverted.

**Example:** `TypeError` was clean for 4 sessions, then came back.

**Action:** The original fix may have been reverted or the root cause has a second trigger.

### Silent degradation

Total error count per session is slowly increasing, even though no single error is alarming.

**Example:** Error rate went from 12/session to 18/session (+50% over 5 sessions).

**Action:** Review recent changes for accumulated technical debt.

## Environmental cost

Each recurring pattern includes an estimated token cost:

```json
{
  "token_cost": {
    "total_tokens_wasted": 50000,
    "estimated_cost_usd": 0.15,
    "energy_wh": 1.7,
    "co2_g": 0.68
  }
}
```

Constants from published research: $0.003/1K tokens (Claude Sonnet), 0.034 Wh/1K tokens (arXiv 2512.03024), 0.4 g CO2/Wh (IEA 2025).

## CLI

Run `tracepulse analyze` for a human-readable pattern report:

```
TracePulse Bug Pattern Analysis
================================

RECURRING (2 bug(s) across 3+ sessions):
  - 8f14e45f... (5 sessions, 127 occurrences)
  - a3c2b1d0... (3 sessions, 42 occurrences)

FLAKY (1 intermittent error(s)):
  - b7e9f2c1... (40% of sessions)

Summary: 2 recurring bug(s), 1 flaky.
```

## Data storage

Session data is stored in `.tracepulse/sessions.json`:
- Max 50 sessions retained (oldest evicted)
- Only fingerprint hashes and timestamps - no raw error messages
- ~30KB typical disk usage
- Add `.tracepulse/` to `.gitignore`
