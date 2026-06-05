# FR: High-signal errors should survive ring buffer eviction

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Effort** | Medium (2 days) |
| **Source** | Agent feedback log 2026-04-28 |
| **Milestone** | M25 |
| **Status** | Open |

## Problem

The event buffer is a 500-event ring buffer. High-signal errors (signal_score ≥ 80) get evicted when the buffer fills with HMR transients and routine log lines. When an agent calls `get_error_context(fingerprint)` minutes after `get_errors` returned the fingerprint, the detail is gone.

Agent quote: "The buffer was likely cleared or the error aged out. This is the 'pinned errors' gap - once an error leaves the buffer, it's gone." Had to fall back to reading source files to diagnose.

## Proposed Change

Extend `FingerprintHistory` (already persists `last_message` per fingerprint) to also store the last full event payload for high-signal errors:

```typescript
interface PersistedEntry {
  fingerprint: string;
  first_seen: number;
  last_seen: number;
  occurrence_count: number;
  last_message: string;
  last_event?: RuntimeEvent;  // NEW: full event for signal_score >= 80
}
```

`get_error_context(fingerprint)` checks the ring buffer first; if not found, falls back to `FingerprintHistory.getLastEvent(fingerprint)`.

## Implementation Options

1. **Store in FingerprintHistory** (recommended) — already has persistence layer, low overhead
2. **Increase ring buffer size** — simple but increases memory footprint for all events
3. **Pinned slot pool** — separate fixed-size pool of 20 slots for high-signal events, FIFO within the pool

Option 1 is lowest effort and targets exactly the right class of events.

## Threshold

Pin events with `signal_score >= 80`. This covers genuine errors while excluding HMR transients (score 20-40) and routine warnings.
