/**
 * Frontend error ring buffer with TTL eviction.
 *
 * Stores FrontendError objects for correlation with backend RuntimeEvents.
 * Supports max-size eviction (FIFO) and TTL-based cleanup on each push.
 *
 * @see src/correlation/types.ts for FrontendError interface
 * @see src/constants/correlation.ts for buffer size and TTL constants
 */

import type { FrontendError } from "@/correlation/types.js";
import {
  FRONTEND_BUFFER_MAX_SIZE,
  FRONTEND_ERROR_TTL_MS,
} from "@/constants/correlation.js";

/** Public API for the frontend error buffer. */
export interface FrontendErrorBuffer {
  push(error: FrontendError): void;
  getAll(): FrontendError[];
  getByUrl(urlSubstring: string): FrontendError[];
  clear(): void;
  size(): number;
}

/**
 * Create a frontend error buffer with max size and TTL eviction.
 *
 * @param maxSize - Maximum errors to store. Defaults to FRONTEND_BUFFER_MAX_SIZE.
 * @param ttlMs - TTL in milliseconds. Defaults to FRONTEND_ERROR_TTL_MS.
 * @returns FrontendErrorBuffer instance.
 */
export function createFrontendErrorBuffer(
  maxSize: number = FRONTEND_BUFFER_MAX_SIZE,
  ttlMs: number = FRONTEND_ERROR_TTL_MS,
): FrontendErrorBuffer {
  let errors: FrontendError[] = [];

  /** Remove expired entries. */
  function evictExpired(): void {
    const cutoff = Date.now() - ttlMs;
    errors = errors.filter((e) => e.timestamp >= cutoff);
  }

  return {
    push(error: FrontendError): void {
      evictExpired();
      errors.push(error);
      // FIFO eviction if over max size
      if (errors.length > maxSize) {
        errors = errors.slice(errors.length - maxSize);
      }
    },

    getAll(): FrontendError[] {
      evictExpired();
      return [...errors].sort((a, b) => b.timestamp - a.timestamp);
    },

    getByUrl(urlSubstring: string): FrontendError[] {
      evictExpired();
      const lower = urlSubstring.toLowerCase();
      return errors
        .filter((e) => e.url.toLowerCase().includes(lower))
        .sort((a, b) => b.timestamp - a.timestamp);
    },

    clear(): void {
      errors = [];
    },

    size(): number {
      evictExpired();
      return errors.length;
    },
  };
}
