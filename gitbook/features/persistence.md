# Persistence & Event Journal

TracePulse has two persistence mechanisms: the **fingerprint history** (cross-session error tracking) and the **event journal** (crash-proof telemetry).

## Event Journal (v0.9.28+)

The event journal writes every error/warn event to disk immediately as it happens. This means even if your dev server crashes (which is exactly when you need the data most), nothing is lost.

### How It Works

```
Ring Buffer (live queries)  →  events.jsonl (crash-proof append)
                                     ↓ (on next startup)
                               telemetry.json (compacted metrics)
```

- **During session:** Events append to `.tracepulse/events.jsonl` synchronously
- **On startup:** Previous session's journal is compacted into `telemetry.json`, journal is cleared
- **No configuration needed** — the journal is always active when persistence is enabled

### Lifecycle Tracking

Each error fingerprint moves through a lifecycle:

```
first_seen → surfaced → investigated → edit_observed → suppressed → resolved
```

- **surfaced** — error was shown to the agent via `get_errors`
- **investigated** — agent called `get_error_context` or `get_prompt_context`
- **edit_observed** — file change detected after investigation
- **suppressed** — error absent for 30s (likely fixed, unconfirmed)
- **resolved** — same command re-ran, error still absent (confirmed fix)
- **recurred** — error came back after being suppressed/resolved

### What This Enables

| Metric | Meaning |
|--------|---------|
| `suppressed_rate` | Errors that disappeared (unconfirmed) |
| `confirmed_fix_rate` | Errors with re-exercise proof of fix |
| `recurrence_rate` | Errors that came back after fix attempts |
| `mean_time_to_fix` | Average time from surfaced to resolved (confirmed only) |

---

## Fingerprint Persistence

With persistence enabled, TracePulse remembers which errors it has seen before - so the agent can distinguish "new bug" from "known issue" across sessions.

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

