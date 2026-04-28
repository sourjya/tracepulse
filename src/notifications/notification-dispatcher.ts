/**
 * Notification dispatcher for proactive error alerting.
 *
 * Determines whether an event should trigger a notification based on
 * novelty (new fingerprint) and signal strength. Designed for future
 * MCP notification support - currently a no-op unless feature flag is set.
 *
 * @see .kiro/specs/phase5-proactive/design.md for notification design
 */

import type { RuntimeEvent } from "@/types/events.js";

/** Notification payload - token-efficient summary of an error. */
export interface ErrorNotificationPayload {
  readonly fingerprint: string;
  readonly message: string;
  readonly signal_strength: string;
  readonly source: string;
  readonly timestamp: number;
}

/** Public API for the notification dispatcher. */
export interface NotificationDispatcher {
  /** Check if an event should trigger a notification. */
  shouldNotify(event: RuntimeEvent): boolean;
  /** Build a token-efficient notification payload. */
  buildPayload(event: RuntimeEvent): ErrorNotificationPayload;
  /** Mark a fingerprint as already notified this session. */
  markNotified(fingerprint: string): void;
}

/**
 * Create a notification dispatcher.
 *
 * @param isNewFingerprint - Function to check if a fingerprint is novel.
 * @returns NotificationDispatcher instance.
 */
export function createNotificationDispatcher(
  isNewFingerprint: (fp: string) => boolean,
): NotificationDispatcher {
  const notified = new Set<string>();

  return {
    shouldNotify(event: RuntimeEvent): boolean {
      // Only notify for new, high-signal errors
      if (notified.has(event.fingerprint)) return false;
      if (!isNewFingerprint(event.fingerprint)) return false;
      if (event.signal_strength !== "high") return false;
      return true;
    },

    buildPayload(event: RuntimeEvent): ErrorNotificationPayload {
      return {
        fingerprint: event.fingerprint,
        message: event.message.slice(0, 200),
        signal_strength: event.signal_strength,
        source: event.source,
        timestamp: event.timestamp,
      };
    },

    markNotified(fingerprint: string): void {
      notified.add(fingerprint);
    },
  };
}
