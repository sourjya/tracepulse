/**
 * Watch controller for time-bounded error collection.
 *
 * Manages the blocking behavior of the watch_for_errors MCP tool.
 * Subscribes to the event buffer, collects error/warn events for the
 * specified duration, then returns. Detects hot-reload events during
 * the watch window.
 *
 * @see src/types/collectors.ts for the EventBuffer interface
 * @see .kiro/specs/phase2-watch-mode/design.md for watch controller design
 */

import type { EventBuffer } from "@/types/collectors.js";
import type { RuntimeEvent, EventSource } from "@/types/events.js";
import {
  MIN_WATCH_DURATION_SECONDS,
  MAX_WATCH_DURATION_SECONDS,
} from "@/constants/watch.js";

/**
 * Result returned by watchForErrors after the watch window expires.
 */
export interface WatchResult {
  /** Error/warn events collected during the watch window. */
  readonly events: RuntimeEvent[];
  /** Actual watch duration in milliseconds. */
  readonly watch_duration_ms: number;
  /** Whether any hot-reload event was detected during the window. null = unknown (attach mode). */
  readonly hot_reload_detected: boolean | null;
  /** Total events seen during window (all levels, not just errors). */
  readonly total_events_seen: number;
}

/**
 * Watch for errors over a time window by subscribing to the event buffer.
 *
 * Blocks for durationSeconds, collecting error and warn level events.
 * Info/debug events are excluded from results but hot-reload markers
 * (fingerprint starting with "hotreload:") are tracked.
 *
 * @param buffer - Event buffer to subscribe to.
 * @param durationSeconds - How long to watch (1-120 seconds).
 * @param source - Optional source filter.
 * @returns Promise resolving to WatchResult after the duration expires.
 * @throws Error if durationSeconds is outside [1, 120].
 */
export function watchForErrors(
  buffer: EventBuffer,
  durationSeconds: number,
  source?: EventSource,
  isAttachMode?: boolean,
): Promise<WatchResult> {
  if (
    durationSeconds < MIN_WATCH_DURATION_SECONDS ||
    durationSeconds > MAX_WATCH_DURATION_SECONDS
  ) {
    return Promise.reject(
      new Error(
        `duration_seconds must be between ${MIN_WATCH_DURATION_SECONDS} and ${MAX_WATCH_DURATION_SECONDS}`,
      ),
    );
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    const collected: RuntimeEvent[] = [];
    let hotReloadDetected = false;
    let totalEventsSeen = 0;

    const unsubscribe = buffer.subscribe((event: RuntimeEvent) => {
      totalEventsSeen++;

      // Track hot-reload events
      if (event.fingerprint.startsWith("hotreload:")) {
        hotReloadDetected = true;
        return;
      }

      // Only collect error and warn level events
      if (event.level !== "error" && event.level !== "warn") return;

      // Apply source filter if provided
      if (source !== undefined && event.source !== source) return;

      collected.push(event);
    });

    const timer = setTimeout(() => {
      unsubscribe();
      resolve({
        events: collected,
        watch_duration_ms: Date.now() - startTime,
        hot_reload_detected: hotReloadDetected ? true : (isAttachMode ? null : false),
        total_events_seen: totalEventsSeen,
      });
    }, durationSeconds * 1000);

    // Ensure timer doesn't prevent Node.js from exiting in tests
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
  });
}
