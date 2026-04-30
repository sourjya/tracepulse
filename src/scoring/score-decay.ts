/**
 * Score decay for transient errors.
 *
 * Reduces signal_score for errors that haven't recurred within a decay window.
 * Primarily targets transient 401s and similar errors that fire once and never
 * repeat - these should lose priority over time so persistent errors surface.
 *
 * Applied as a post-query transform, not in the buffer itself, to keep
 * the buffer's stored scores stable for pinning decisions.
 *
 * @see src/scoring/infra-patterns.ts for related scoring logic
 */

import type { RuntimeEvent } from "@/types/events.js";

/** Decay window in milliseconds. Errors older than this with occurrence_count=1 get decayed. */
const DECAY_WINDOW_MS = 60_000;

/** Score reduction for decayed events. */
const DECAY_AMOUNT = 20;

/** HTTP status codes that are commonly transient. */
const TRANSIENT_STATUS_CODES = new Set([401, 403, 408, 429]);

/**
 * Apply score decay to events that are likely transient.
 *
 * An event is considered transient if:
 * 1. It has occurrence_count === 1 (never recurred)
 * 2. It's older than DECAY_WINDOW_MS
 * 3. It has a transient HTTP status code (401, 403, 408, 429)
 *
 * Decayed events get a reduced signal_score but are not removed.
 *
 * @param events - Events to potentially decay (not mutated - returns new array).
 * @returns Events with decayed scores where applicable.
 */
export function applyScoreDecay(events: readonly RuntimeEvent[]): RuntimeEvent[] {
  const now = Date.now();
  return events.map((event) => {
    const age = now - event.timestamp;
    const isTransientStatus = event.context.http_status !== undefined &&
      TRANSIENT_STATUS_CODES.has(event.context.http_status);

    if (
      event.occurrence_count === 1 &&
      age > DECAY_WINDOW_MS &&
      isTransientStatus
    ) {
      const decayedScore = Math.max(0, event.signal_score - DECAY_AMOUNT);
      return { ...event, signal_score: decayedScore };
    }
    return event;
  });
}
