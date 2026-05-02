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

## Tools Enabled by Persistence

| Tool | What it does with persistence |
|------|------------------------------|
| `get_new_errors()` | Returns only errors with fingerprints never seen in previous sessions. Filters out known recurring issues. |
| `get_error_trends(fingerprint)` | Shows cross-session frequency: "This error appeared in 3 of the last 5 sessions." |

Without persistence, `get_new_errors()` treats every error as new (since there's no history to compare against).

## Security

The persistence file stores only hashes and metadata - no raw error messages or stack traces beyond the 200-char truncated `last_message`. The file is local to your machine in the `.tracepulse/` directory.
