# Fingerprint Persistence

Track which errors have been seen across sessions.

## Enable

```bash
tracepulse start --persist "npm run dev"
```

## What It Does

- On startup: loads fingerprint history from `.tracepulse/fingerprints.json`
- During session: tracks which fingerprints are new vs known
- On shutdown: saves updated fingerprints to disk

## Tools Enabled

- `get_new_errors()` — only errors with fingerprints not seen before
- `get_error_trends(fingerprint)` — cross-session frequency and history

## Security

The persistence file stores only fingerprint hashes, first_seen, last_seen, and total_count. No raw error messages or stack traces are persisted.
