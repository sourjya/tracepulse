/**
 * API key authentication and rate limiting for REST endpoints.
 *
 * Auth: timing-safe comparison of X-API-Key header against TRACEPULSE_API_KEY.
 * Rate limiting: per-client sliding window counter.
 *
 * Both are optional - disabled when env vars are not set.
 *
 * @see .kiro/specs/m22-http-rest-api/requirements.md Phase 2
 */

import { timingSafeEqual } from "node:crypto";

// ──────────────────────────────────────────────
// API Key Auth
// ──────────────────────────────────────────────

/**
 * Create an auth middleware function.
 *
 * When apiKey is undefined, all requests are allowed (dev mode).
 * When set, the provided key must match exactly (timing-safe).
 *
 * @param apiKey - Expected API key, or undefined to disable auth.
 * @returns Function that returns true if the request is authorized.
 */
export function createAuthMiddleware(apiKey: string | undefined): (providedKey: string | undefined) => boolean {
  if (!apiKey) return () => true;

  const expected = Buffer.from(apiKey);

  return (providedKey: string | undefined): boolean => {
    if (!providedKey) return false;
    const provided = Buffer.from(providedKey);
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  };
}

// ──────────────────────────────────────────────
// Rate Limiter
// ──────────────────────────────────────────────

/** Rate limiter public API. */
export interface RateLimiter {
  /** Check if a client is within rate limits. Returns false if exceeded. */
  check(clientId: string): boolean;
}

/**
 * Create a per-client sliding window rate limiter.
 *
 * @param maxRequests - Maximum requests per window.
 * @param windowMs - Window duration in milliseconds.
 * @returns RateLimiter instance.
 */
export function createRateLimiter(maxRequests = 60, windowMs = 60000): RateLimiter {
  const windows = new Map<string, { count: number; start: number }>();

  return {
    check(clientId: string): boolean {
      const now = Date.now();
      const window = windows.get(clientId);

      if (!window || now - window.start > windowMs) {
        // New window
        windows.set(clientId, { count: 1, start: now });
        return true;
      }

      if (window.count >= maxRequests) return false;

      window.count++;
      return true;
    },
  };
}
