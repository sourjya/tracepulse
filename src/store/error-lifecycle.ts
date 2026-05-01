/**
 * Error lifecycle manager - tracks resolution and expiry of transient errors.
 *
 * Marks errors as "likely resolved" when they stop recurring after a file change,
 * and auto-expires HMR transient errors after a configurable window.
 *
 * Operates as a post-query filter on ring buffer results. Does not modify
 * the buffer itself - resolution status is tracked separately.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for error lifecycle design
 */

import type { RuntimeEvent } from "@/types/events.js";
import { HMR_EXPIRY_MS, RESOLUTION_WINDOW_MS, MAX_LIFECYCLE_TRACKED } from "@/constants/limits.js";

/** Resolution status for a fingerprint. */
interface ResolutionState {
  /** When the error was last seen. */
  lastSeen: number;
  /** Whether a file change occurred after the error. */
  fileChangeAfter: boolean;
  /** When the file change occurred. */
  fileChangeAt?: number;
  /** Whether this is an HMR transient (from hot-reload crash). */
  isHmrTransient: boolean;
}

/** Public API for the error lifecycle manager. */
export interface ErrorLifecycle {
  /** Record that an error was seen. */
  recordError(fingerprint: string, isHmrTransient?: boolean): void;
  /** Record that a file change (HMR/build) occurred. */
  recordFileChange(): void;
  /** Check if an error is likely resolved. */
  isLikelyResolved(fingerprint: string): boolean;
  /** Check if an error is an expired HMR transient. */
  isExpiredTransient(fingerprint: string): boolean;
  /** Filter out resolved and expired events from a list. */
  filterActive(events: readonly RuntimeEvent[]): RuntimeEvent[];
}



/**
 * Create an error lifecycle manager.
 *
 * @returns ErrorLifecycle instance.
 */
export function createErrorLifecycle(): ErrorLifecycle {
  const states = new Map<string, ResolutionState>();
  let lastFileChangeAt: number | null = null;

  /** Evict oldest entries when over limit. */
  function evictIfNeeded(): void {
    if (states.size <= MAX_LIFECYCLE_TRACKED) return;
    const oldest = [...states.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
    if (oldest) states.delete(oldest[0]);
  }

  return {
    recordError(fingerprint: string, isHmrTransient = false): void {
      const existing = states.get(fingerprint);
      if (existing) {
        existing.lastSeen = Date.now();
        // If error recurs after file change, it's NOT resolved
        existing.fileChangeAfter = false;
      } else {
        states.set(fingerprint, {
          lastSeen: Date.now(),
          fileChangeAfter: false,
          isHmrTransient,
        });
        evictIfNeeded();
      }
    },

    recordFileChange(): void {
      lastFileChangeAt = Date.now();
      // Mark all current errors as having a file change after them
      for (const state of states.values()) {
        if (!state.fileChangeAfter) {
          state.fileChangeAfter = true;
          state.fileChangeAt = lastFileChangeAt;
        }
      }
    },

    isLikelyResolved(fingerprint: string): boolean {
      const state = states.get(fingerprint);
      if (!state) return false;
      if (!state.fileChangeAfter || !state.fileChangeAt) return false;
      // Error hasn't recurred for RESOLUTION_WINDOW_MS after a file change
      return (Date.now() - state.fileChangeAt) > RESOLUTION_WINDOW_MS &&
             state.lastSeen < state.fileChangeAt;
    },

    isExpiredTransient(fingerprint: string): boolean {
      const state = states.get(fingerprint);
      if (!state) return false;
      if (!state.isHmrTransient) return false;
      // HMR transient hasn't recurred for HMR_EXPIRY_MS
      return (Date.now() - state.lastSeen) > HMR_EXPIRY_MS;
    },

    filterActive(events: readonly RuntimeEvent[]): RuntimeEvent[] {
      return events.filter((e) => {
        if (this.isExpiredTransient(e.fingerprint)) return false;
        if (this.isLikelyResolved(e.fingerprint)) return false;
        return true;
      });
    },
  };
}
