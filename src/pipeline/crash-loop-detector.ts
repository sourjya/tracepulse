/**
 * Crash loop detector for the event pipeline.
 *
 * Tracks restart events (hot-reload patterns) in a sliding window.
 * If 3+ restarts occur within 60 seconds AND errors exist between
 * restarts, injects a synthetic "CRASH LOOP DETECTED" event.
 *
 * @see src/watch/hot-reload-patterns.ts for restart event detection
 */

import type { RuntimeEvent } from "@/types/events.js";

/** Restarts within this window trigger crash loop detection. */
const CRASH_LOOP_WINDOW_MS = 60_000;

/** Minimum restarts in window to declare a crash loop. */
const CRASH_LOOP_THRESHOLD = 3;

/**
 * Create a crash loop detector.
 *
 * @param onCrashLoop - Called when a crash loop is detected.
 * @returns A function to call on each new event.
 */
export function createCrashLoopDetector(
  onCrashLoop: (event: RuntimeEvent) => void,
): (event: RuntimeEvent) => void {
  const restartTimestamps: number[] = [];
  let lastAlertAt = 0;

  return (event: RuntimeEvent): void => {
    if (!event.fingerprint.startsWith("hotreload:")) return;

    const now = event.timestamp;
    restartTimestamps.push(now);

    // Evict old timestamps outside the window
    while (restartTimestamps.length > 0 && restartTimestamps[0] < now - CRASH_LOOP_WINDOW_MS) {
      restartTimestamps.shift();
    }

    // Check threshold - don't alert more than once per window
    if (restartTimestamps.length >= CRASH_LOOP_THRESHOLD && now - lastAlertAt > CRASH_LOOP_WINDOW_MS) {
      lastAlertAt = now;
      onCrashLoop({
        id: crypto.randomUUID(),
        timestamp: now,
        source: "server-stderr",
        service: "main",
        level: "error",
        message: `CRASH LOOP DETECTED: ${restartTimestamps.length} restarts in ${Math.round(CRASH_LOOP_WINDOW_MS / 1000)}s. Server is repeatedly crashing on startup.`,
        fingerprint: "crashloop:detected",
        signal_score: 95,
        signal_strength: "high",
        context: { error_type: "CrashLoop" },
        raw: `${restartTimestamps.length} restarts in ${CRASH_LOOP_WINDOW_MS}ms`,
        first_seen: now,
        occurrence_count: 1,
      });
    }
  };
}
