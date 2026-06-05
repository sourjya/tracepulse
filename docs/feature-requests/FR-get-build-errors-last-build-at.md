# FR: get_build_errors should include last_build_at timestamp

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Effort** | Low (half day) |
| **Source** | Agent feedback log 2026-04-28 |
| **Milestone** | M25 |
| **Status** | Open |

## Problem

Agents cannot distinguish between two "zero errors" states:
- "No errors because the build succeeded and I'm seeing fresh output"
- "No errors because the build hasn't run yet and the buffer is from session start"

The existing `oldest_event_at` and `buffer_cleared_at` fields reflect buffer lifecycle, not compilation. Agents need a `last_build_at` timestamp that updates specifically when the compiler emits a "compiled successfully" (or equivalent) line.

Agent quote (asked three times): "A 'last build timestamp' field would help distinguish 'no errors because build succeeded' from 'no errors because build hasn't run yet.'"

## Proposed Change

Add `last_build_at` to `get_build_errors` response:

```json
{
  "errors": [],
  "total": 0,
  "last_build_at": 1748923456000,
  "oldest_event_at": 1748920000000,
  "buffer_cleared_at": null
}
```

When `last_build_at` is `null`, agents know no "compiled successfully" line has been seen yet — the buffer may be stale.

## Implementation Notes

- Vite prints: `✓ built in 1.06s` / `✓ 910 modules transformed`
- Webpack prints: `webpack compiled successfully in 1234ms`
- Next.js: `✓ Compiled /page in 234ms`
- These patterns already flow through the build error parser in `src/parsers/build-error-parser.ts`
- Add a `lastBuildAt` field to the parser state, updated whenever a "success" line is matched
- Expose via `get_build_errors` response

## Bonus

Parse and include `modules_count` and `build_duration_ms` from the same Vite output line — zero extra work once the parser is reading these lines.
