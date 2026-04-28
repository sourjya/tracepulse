/**
 * Bounded circular buffer for RuntimeEvents with fingerprint-based dedup.
 *
 * Stores up to maxSize events in a pre-allocated array using modulo arithmetic
 * for O(1) push. Duplicate fingerprints update occurrence_count and timestamp
 * in-place instead of adding new entries. Queries iterate the buffer, apply
 * filters, and return results sorted newest-first.
 *
 * This is the core event store that MCP tool handlers read from. The ring
 * buffer ensures bounded memory regardless of how long the dev server runs.
 *
 * @see src/types/collectors.ts for the EventBuffer interface
 * @see src/constants/limits.ts for RING_BUFFER_MAX_SIZE
 */

import type { EventBuffer } from "@/types/collectors.js";
import type { RuntimeEvent, EventFilters } from "@/types/events.js";
import { RING_BUFFER_MAX_SIZE } from "@/constants/limits.js";
import { LOG_LEVEL_SEVERITY } from "@/constants/events.js";

/**
 * Create a bounded ring buffer that implements EventBuffer.
 *
 * Uses a fixed-size array with a circular write pointer. Fingerprint-based
 * dedup prevents duplicate events from consuming buffer slots. When the
 * buffer is full, the oldest event is overwritten (FIFO eviction).
 *
 * @param maxSize - Maximum number of events to store. Defaults to RING_BUFFER_MAX_SIZE (500).
 * @returns An EventBuffer backed by a circular array.
 */
export function createRingBuffer(maxSize: number = RING_BUFFER_MAX_SIZE): EventBuffer {
  /** Pre-allocated sparse array - slots are undefined until written. */
  const slots: (RuntimeEvent | undefined)[] = new Array<RuntimeEvent | undefined>(maxSize);
  /** Fingerprint → buffer index for O(1) dedup lookup. */
  const fpMap = new Map<string, number>();
  /** Active event subscribers notified synchronously on new (non-dedup) push. */
  const subscribers = new Set<(event: RuntimeEvent) => void>();
  /** Next write position (wraps via modulo). */
  let writePtr = 0;
  /** How many slots are occupied (caps at maxSize). */
  let count = 0;
  /** When this buffer was created. */
  const sessionStartedAt = Date.now();
  /** When clear() was last called. */
  let bufferClearedAt: number | null = null;

  /**
   * Check whether an event passes all provided filters.
   * Omitted filter fields mean "no constraint".
   *
   * @param event - The event to test.
   * @param filters - Query filters to apply.
   * @returns true if the event matches all active filters.
   */
  function matches(event: RuntimeEvent, filters: EventFilters): boolean {
    if (filters.since !== undefined && event.timestamp <= filters.since) {
      return false;
    }
    if (filters.source !== undefined && event.source !== filters.source) {
      return false;
    }
    if (
      filters.level !== undefined &&
      LOG_LEVEL_SEVERITY[event.level] > LOG_LEVEL_SEVERITY[filters.level]
    ) {
      return false;
    }
    if (filters.message_contains !== undefined) {
      const needle = filters.message_contains.toLowerCase();
      if (
        !event.message.toLowerCase().includes(needle) &&
        !event.raw.toLowerCase().includes(needle)
      ) {
        return false;
      }
    }
    if (filters.status_code_min !== undefined) {
      const status = event.context.http_status;
      if (status === undefined || status < filters.status_code_min) {
        return false;
      }
    }
    return true;
  }

  /**
   * Collect all events that pass the given filters.
   * Returns newest-first (sorted by timestamp descending).
   *
   * @param filters - Query filters. limit is applied after sorting.
   * @returns Matching events, newest first.
   */
  function collectMatching(filters: EventFilters): RuntimeEvent[] {
    const results: RuntimeEvent[] = [];
    for (let i = 0; i < count; i++) {
      const event = slots[i]!;
      if (matches(event, filters)) {
        results.push(event);
      }
    }
    // Newest first
    results.sort((a, b) => b.timestamp - a.timestamp);
    if (filters.limit !== undefined) {
      return results.slice(0, filters.limit);
    }
    return results;
  }

  return {
    push(event: RuntimeEvent): void {
      const existingIdx = fpMap.get(event.fingerprint);

      // Dedup: if fingerprint exists AND the slot still holds that fingerprint
      // (not overwritten by FIFO eviction), update in-place.
      if (
        existingIdx !== undefined &&
        slots[existingIdx] !== undefined &&
        slots[existingIdx]!.fingerprint === event.fingerprint
      ) {
        const existing = slots[existingIdx]!;
        // Update occurrence_count and timestamp; preserve first_seen and all other fields.
        slots[existingIdx] = {
          ...existing,
          occurrence_count: existing.occurrence_count + 1,
          timestamp: event.timestamp,
        };
        return;
      }

      // If overwriting an occupied slot, remove its fingerprint from the map
      const overwritten = slots[writePtr];
      if (overwritten !== undefined) {
        // Only delete if the map still points to this index (could be stale)
        if (fpMap.get(overwritten.fingerprint) === writePtr) {
          fpMap.delete(overwritten.fingerprint);
        }
      }

      // Write new event
      slots[writePtr] = event;
      fpMap.set(event.fingerprint, writePtr);

      if (count < maxSize) {
        count++;
      }

      writePtr = (writePtr + 1) % maxSize;

      // Notify subscribers - only for new events, not dedup updates.
      // Each callback is isolated so one failure doesn't break others.
      for (const cb of subscribers) {
        try {
          cb(event);
        } catch (err) {
          process.stderr.write(
            `[tracepulse] subscriber error: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      }
    },

    query(filters: EventFilters): RuntimeEvent[] {
      return collectMatching(filters);
    },

    count(filters?: EventFilters): number {
      if (!filters) {
        return count;
      }
      // Count without collecting - skip limit since we want total matching count
      let total = 0;
      for (let i = 0; i < count; i++) {
        if (matches(slots[i]!, filters)) {
          total++;
        }
      }
      return total;
    },

    clear(): number {
      const removed = count;
      slots.fill(undefined);
      fpMap.clear();
      writePtr = 0;
      count = 0;
      bufferClearedAt = Date.now();
      return removed;
    },

    get size(): number {
      return count;
    },

    get sessionStartedAt(): number {
      return sessionStartedAt;
    },

    get bufferClearedAt(): number | null {
      return bufferClearedAt;
    },

    get oldestEventAt(): number | null {
      if (count === 0) return null;
      let oldest = Infinity;
      for (let i = 0; i < count; i++) {
        if (slots[i] && slots[i]!.timestamp < oldest) {
          oldest = slots[i]!.timestamp;
        }
      }
      return oldest;
    },

    subscribe(callback: (event: RuntimeEvent) => void): () => void {
      subscribers.add(callback);
      /** Idempotent unsubscribe - safe to call multiple times. */
      return () => { subscribers.delete(callback); };
    },
  };
}
