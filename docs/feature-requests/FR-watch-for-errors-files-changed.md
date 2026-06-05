# FR: watch_for_errors should include files_changed list

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Effort** | Low (1 day) |
| **Source** | Agent feedback log 2026-04-28 (Wishlist #18) |
| **Milestone** | M25 |
| **Status** | Open |

## Problem

`watch_for_errors` returns `hot_reload_detected: true` with no information about what changed. Agents cannot distinguish "HMR fired for auth.py" from "HMR fired for an unrelated file." This makes the tool useful only as a binary signal, not as a debugging aid.

Agent quote: "Would be useful if watch_for_errors could report 'HMR completed successfully for N files' rather than just silence. Silence means either 'nothing happened' or 'everything is fine' - can't distinguish."

## Proposed Change

Add `files_changed` to the `watch_for_errors` response when `hot_reload_detected: true`:

```json
{
  "hot_reload_detected": true,
  "files_changed": ["auth.py", "models/user.py"],
  "hmr_events_seen": 3,
  "errors": [],
  "total_events_seen": 12
}
```

The file-change tracker already captures this data (shipped post-v0.8.1). The missing piece is wiring its output into the watch result.

## Implementation Notes

- `src/collectors/file-change-tracker.ts` already captures which files triggered reloads
- `src/tools/watch-for-errors.ts` needs to read from the tracker and include the list in the response
- When `hot_reload_detected: false`, `files_changed` should be `[]` or omitted

## Also Applies To

`verify_fix` response should include the same `files_changed` field (Wishlist #18 originally targeted verify_fix). Both tools share the same watch window logic.
