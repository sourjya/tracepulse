# FR: run_and_watch timeout error should guide recovery

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Effort** | Low (2 hours) |
| **Source** | Agent feedback log 2026-05-16 |
| **Milestone** | M25 |
| **Status** | Open |

## Problem

When `run_and_watch` times out (default 60s), it returns a generic timeout error. The agent's response is to abandon `run_and_watch` entirely and fall back to shell for all subsequent test runs in the session.

This is the same one-rejection-causes-full-session-fallback pattern that drove several previous fixes. The fix is the same: a better error message that tells the agent exactly what to do.

## Proposed Change

Current error message:
```
Command timed out after 60s.
```

New error message:
```
Command timed out after 60s. For large test suites (500+ tests), use timeout_seconds: 120 or higher.
Example: run_and_watch("pytest tests/unit/", cwd: "./backend", timeout_seconds: 120)
```

## SKILL.md Update Needed

Add to the run_and_watch section:
```
Large test suites (500+ tests): use timeout_seconds: 120. The default 60s is calibrated for single-file runs.
```

## Implementation

One-line change in `src/tools/run-and-watch.ts` in the timeout error branch. No logic change.
