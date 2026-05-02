# Watch Mode

The core feedback loop: edit code, check if it worked, fix if not, repeat. Watch mode tools block for a duration (or until an event) and return what happened - so the agent knows whether its change worked without polling.

## Which Tool to Use

| Situation | Tool | How it works |
|-----------|------|-------------|
| After any code change (default) | `verify_fix(5)` | Watches 5s + checks build + returns pass/fail verdict |
| After frontend + backend changes | `verify_build(cwd: "./frontend")` | Runs tsc + build + runtime check in one call |
| Quick CSS/template change | `get_build_errors()` | Returns instantly - no waiting |
| Need to wait for slow build | `wait_for_build(30)` | Event-driven - returns when build finishes, not after fixed time |
| Need fine-grained control | `watch_for_errors(15)` | Blocks 15s, collects all new errors |
| Waiting for a specific event | `wait_for_event("error", 30)` | Blocks until next error/warning/build/crash |

## verify_fix - The Recommended Default

One call replaces three separate checks:

```
verify_fix(duration_seconds: 5, fingerprint: "abc123")
```

Returns:
```json
{
  "verdict": "PASS",
  "claim": { "resolved": true, "prior_occurrences": 42 },
  "watch": { "new_errors": 0, "hot_reload_detected": true },
  "build_errors": 0
}
```

Pass a `fingerprint` to verify that a specific error is gone - not just that zero new errors appeared. The agent gets a definitive "your fix resolved the target error" instead of a vague "no new errors."

## verify_build - For Frontend Projects

Runs type-check + build + runtime check in one call:

```
verify_build(cwd: "./frontend")
```

Returns per-step results with early exit on failure:
```json
{
  "verdict": "PASS",
  "steps": [
    { "step": "typecheck", "pass": true, "detail": "Clean in 1200ms" },
    { "step": "build", "pass": true, "detail": "Built in 3400ms" },
    { "step": "runtime", "pass": true, "detail": "Zero errors in 3s" }
  ]
}
```

## The Proven Debugging Loop

When TracePulse surfaces real errors, this is the fastest resolution path:

```
1. get_new_errors(limit: 5)    # Only unseen fingerprints
2. Read: context.file, context.line, context.error_type
3. Fix the root cause
4. clear_errors()              # Clean baseline
5. verify_fix(5)               # Watch 5s, pass/fail
6. If PASS: done. If FAIL: repeat from 2.
```

This loop resolved a 25-occurrence migration error in under 2 minutes during real-world testing.

> **Tool Reference:** See all [36 MCP Tools](mcp-tools.md) for complete parameter details.
