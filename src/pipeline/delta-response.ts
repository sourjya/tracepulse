/**
 * Delta response support for no-change detection.
 *
 * Computes a lightweight hash of the buffer state so tools can
 * return a 20-token "no_change" response instead of the full
 * 1,000-token payload when nothing has changed.
 *
 * @see .kiro/specs/m17-token-wave1/requirements.md W1.2
 */

import type { EventBuffer } from "@/types/collectors.js";

/**
 * Compute a hash of the buffer's current state.
 * Changes when: new event pushed, event cleared, build detected.
 *
 * @param buffer - The event buffer to hash.
 * @returns A string hash representing the current buffer state.
 */
export function computeBufferHash(buffer: EventBuffer): string {
  // Combine size + oldest timestamp + last build + cleared timestamp
  // into a simple string hash. Not cryptographic - just change detection.
  const parts = [
    buffer.size,
    buffer.oldestEventAt ?? 0,
    buffer.lastBuildAt ?? 0,
    buffer.bufferClearedAt ?? 0,
    buffer.sessionStartedAt,
  ];
  return parts.join(":");
}
