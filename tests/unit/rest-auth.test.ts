/**
 * Tests for API key auth and rate limiting on REST endpoints.
 *
 * @see src/transport/rest-auth.ts
 */

import { describe, it, expect, vi } from "vitest";
import { createAuthMiddleware, createRateLimiter } from "@/transport/rest-auth.js";

describe("API key auth", () => {
  it("allows requests when no API key configured", () => {
    const auth = createAuthMiddleware(undefined);
    expect(auth("anything")).toBe(true);
  });

  it("allows requests with correct key", () => {
    const auth = createAuthMiddleware("secret-key-123");
    expect(auth("secret-key-123")).toBe(true);
  });

  it("rejects requests with wrong key", () => {
    const auth = createAuthMiddleware("secret-key-123");
    expect(auth("wrong-key")).toBe(false);
  });

  it("rejects requests with missing key when configured", () => {
    const auth = createAuthMiddleware("secret-key-123");
    expect(auth(undefined)).toBe(false);
    expect(auth("")).toBe(false);
  });
});

describe("Rate limiter", () => {
  it("allows requests within limit", () => {
    const limiter = createRateLimiter(5, 60000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("client-1")).toBe(true);
    }
  });

  it("rejects requests exceeding limit", () => {
    const limiter = createRateLimiter(3, 60000);
    expect(limiter.check("client-1")).toBe(true);
    expect(limiter.check("client-1")).toBe(true);
    expect(limiter.check("client-1")).toBe(true);
    expect(limiter.check("client-1")).toBe(false);
  });

  it("tracks clients independently", () => {
    const limiter = createRateLimiter(2, 60000);
    expect(limiter.check("client-1")).toBe(true);
    expect(limiter.check("client-1")).toBe(true);
    expect(limiter.check("client-1")).toBe(false);
    // Different client still has quota
    expect(limiter.check("client-2")).toBe(true);
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.check("c")).toBe(true);
    expect(limiter.check("c")).toBe(true);
    expect(limiter.check("c")).toBe(false);
    vi.advanceTimersByTime(1100);
    expect(limiter.check("c")).toBe(true);
    vi.useRealTimers();
  });
});
