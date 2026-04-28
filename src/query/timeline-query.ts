/**
 * Timeline query module for time-range queries on the event buffer.
 *
 * Provides queryTimeline (time-windowed event retrieval), querySurroundingLogs
 * (context around a specific error), and countOccurrences (fingerprint frequency).
 * Used by the get_timeline and get_error_context MCP tool handlers.
 *
 * @see src/types/collectors.ts for the EventBuffer interface
 * @see .kiro/specs/phase2-watch-mode/design.md for query specifications
 */

import type { EventBuffer } from "@/types/collectors.js";
import type { RuntimeEvent } from "@/types/events.js";

/**
 * Query events within a time window [since, since + durationSeconds*1000].
 * If durationSeconds is omitted, returns events from since to now.
 * Results are sorted by timestamp ascending (chronological order).
 *
 * @param buffer - Event buffer to query.
 * @param since - Start of window (Unix ms).
 * @param durationSeconds - Window length in seconds. Omit for since-to-now.
 * @param limit - Max results to return.
 * @returns Events in chronological order, capped at limit.
 */
export function queryTimeline(
  buffer: EventBuffer,
  since: number,
  durationSeconds?: number,
  limit?: number,
): RuntimeEvent[] {
  const end = durationSeconds !== undefined ? since + durationSeconds * 1000 : Date.now();

  // Buffer.query returns newest-first; we need all events then filter by window
  const all = buffer.query({});
  const inWindow = all.filter(
    (e) => e.timestamp >= since && e.timestamp <= end,
  );

  // Sort ascending (chronological)
  inWindow.sort((a, b) => a.timestamp - b.timestamp);

  if (limit !== undefined) {
    return inWindow.slice(0, limit);
  }
  return inWindow;
}

/**
 * Query surrounding log events within ±windowMs of a target event.
 * Excludes the target event itself. Results sorted ascending by timestamp.
 *
 * @param buffer - Event buffer to query.
 * @param targetEvent - The event to find context around.
 * @param windowMs - Time window in milliseconds (applied both before and after).
 * @param maxResults - Maximum surrounding events to return.
 * @returns Surrounding events in chronological order.
 */
export function querySurroundingLogs(
  buffer: EventBuffer,
  targetEvent: RuntimeEvent,
  windowMs: number,
  maxResults: number,
): RuntimeEvent[] {
  const all = buffer.query({});
  const surrounding = all.filter(
    (e) =>
      e.fingerprint !== targetEvent.fingerprint &&
      Math.abs(e.timestamp - targetEvent.timestamp) <= windowMs,
  );

  surrounding.sort((a, b) => a.timestamp - b.timestamp);
  return surrounding.slice(0, maxResults);
}

/**
 * Count total occurrences of a fingerprint in the buffer.
 * Returns the occurrence_count from the deduplicated event, or 0 if not found.
 *
 * @param buffer - Event buffer to query.
 * @param fingerprint - Fingerprint to count.
 * @returns Total occurrence count.
 */
export function countOccurrences(
  buffer: EventBuffer,
  fingerprint: string,
): number {
  const all = buffer.query({});
  const event = all.find((e) => e.fingerprint === fingerprint);
  return event ? event.occurrence_count : 0;
}
