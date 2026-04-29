# The Edit-Verify Loop

The core workflow: edit code, verify it works, repeat.

## The Pattern

```
1. Edit code
2. verify_fix(10)  ->  PASS or FAIL
3. If FAIL: read error, fix, go to 2
4. If PASS: move on
```

## Using verify_fix (recommended)

One tool call replaces three:

```
verify_fix(duration_seconds: 10)
```

Returns:
```json
{
  "verdict": "PASS",
  "watch": { "new_errors": 0, "hot_reload_detected": true, "total_events_seen": 5 },
  "build_errors": 0,
  "last_build_at": 1714300005000
}
```

## Using watch_for_errors (more control)

```
watch_for_errors(duration_seconds: 15)
```

Blocks for 15 seconds, collects new errors. Check `hot_reload_detected` to confirm the server reloaded.

## Using get_build_errors (instant check)

```
get_build_errors()
```

Returns TypeScript, ESLint, and Vite/webpack errors immediately. Best for quick checks after CSS or template changes.

## Using wait_for_build (event-driven)

```
wait_for_build(timeout_seconds: 30)
```

Blocks until the next build completes (not a fixed duration). Returns immediately when Vite/webpack/uvicorn finishes recompiling.

## Which to use?

| Situation | Tool |
|-----------|------|
| After any code change (default) | `verify_fix(10)` |
| Quick CSS/template change | `get_build_errors()` |
| Need to wait for slow build | `wait_for_build(30)` |
| Need fine-grained control | `watch_for_errors(15)` |

## Attach Mode Caveat

In attach mode (tailing a log file), `hot_reload_detected` returns `null` (unknown) instead of `true`/`false` if the dev server's reload messages go to a different process. Use `get_build_errors` as the reliable check in attach mode.

## The Proven Debugging Loop

When TracePulse surfaces real errors, this is the fastest resolution path. Validated in production - resolved a 25-occurrence migration error in under 2 minutes.

```
1. get_new_errors(limit: 5)    # Only unseen fingerprints
2. Read: context.file, context.line, context.error_type
3. Fix the root cause
4. clear_errors()              # Clean baseline
5. verify_fix(10)              # Watch 10s, pass/fail
6. If PASS: done. If FAIL: repeat from 2.
```

This loop is more productive than the basic edit-verify pattern because `get_new_errors` filters out noise (old errors still in buffer) and `clear_errors` gives you a clean baseline for verification.
