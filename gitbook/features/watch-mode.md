# Watch Mode

Block for a duration and collect new errors. The core edit-verify feedback loop.

## Tools

- `watch_for_errors(duration_seconds, source?)` - time-based, collects errors during window
- `wait_for_build(timeout_seconds?)` - event-driven, returns when build completes
- `wait_for_event(type, timeout_seconds?)` - event-driven, returns on matching event
- `verify_fix(duration_seconds?)` - composite: watch + build check + pass/fail

## Time-Based vs Event-Driven

| Tool | Waits for | Best when |
|------|-----------|-----------|
| `watch_for_errors` | Fixed duration | You want all errors in a window |
| `wait_for_build` | Build completion event | You want to know when the build finishes |
| `wait_for_event` | Specific event type | You want the next error/crash/build |
| `verify_fix` | Fixed duration + checks | You want a pass/fail verdict |
