# Fingerprint Persistence

By default, TracePulse forgets everything when the session ends. With persistence enabled, it remembers which errors it has seen before - so the agent can distinguish "new bug" from "known issue" across sessions.

## Enable

```bash
tracepulse start --persist "npm run dev"
```

## What It Stores

On shutdown, TracePulse saves to `.tracepulse/fingerprints.json`:
- Fingerprint hash (SHA-256 of error signature)
- First seen timestamp
- Last seen timestamp
- Total occurrence count
- Last error message (truncated to 200 chars)

On next startup, it loads this history. Any error with a known fingerprint is marked as "seen before."

## Disk Usage & Cleanup

| Metric | Value |
|--------|-------|
| Max fingerprints stored | 5,000 (LRU eviction) |
| Typical project | 50-200 unique fingerprints |
| Size per entry | ~150 bytes |
| Typical file size | 10-30 KB |
| Maximum file size | ~750 KB |
| Cleanup | Automatic - oldest entries evicted when cap reached |

You never need to manually clean up. When the file reaches 5,000 entries, the oldest fingerprints (by `last_seen` timestamp) are evicted automatically on save. Errors you haven't seen in months drop off naturally.

To reset manually: delete `.tracepulse/fingerprints.json` and restart.

## Tools Enabled by Persistence

| Tool | What it does with persistence |
|------|------------------------------|
| `get_new_errors()` | Returns only errors with fingerprints never seen in previous sessions. Filters out known recurring issues. |
| `get_error_trends(fingerprint)` | Shows cross-session frequency: "This error appeared in 3 of the last 5 sessions." |

Without persistence, `get_new_errors()` treats every error as new (since there's no history to compare against).

## Security

The persistence file stores only hashes and metadata - no raw error messages or stack traces beyond the 200-char truncated `last_message`. The file is local to your machine in the `.tracepulse/` directory. Add `.tracepulse/` to your `.gitignore`.

> **Tool Reference:** See all [36 MCP Tools](mcp-tools.md) for complete parameter details.
