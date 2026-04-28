/**
 * Unit tests for frontend error buffer.
 *
 * @see src/correlation/frontend-error-buffer.ts for the implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFrontendErrorBuffer } from "@/correlation/frontend-error-buffer.js";
import type { FrontendError } from "@/correlation/types.js";

function makeFrontendError(overrides: Partial<FrontendError> = {}): FrontendError {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    url: "http://localhost:3000/api/users",
    path: "/api/users",
    method: "GET",
    statusCode: 500,
    statusText: "Internal Server Error",
    responseHeaders: {},
    source: "cdp",
    ...overrides,
  };
}

describe("frontend error buffer", () => {
  it("push and retrieve — pushed errors appear in getAll()", () => {
    const buf = createFrontendErrorBuffer(10);
    const err = makeFrontendError();
    buf.push(err);
    expect(buf.getAll()).toHaveLength(1);
    expect(buf.getAll()[0].id).toBe(err.id);
  });

  it("max size eviction — oldest evicted when full", () => {
    const buf = createFrontendErrorBuffer(3);
    const now = Date.now();
    buf.push(makeFrontendError({ id: "a", timestamp: now - 3000 }));
    buf.push(makeFrontendError({ id: "b", timestamp: now - 2000 }));
    buf.push(makeFrontendError({ id: "c", timestamp: now - 1000 }));
    buf.push(makeFrontendError({ id: "d", timestamp: now }));

    expect(buf.size()).toBe(3);
    const ids = buf.getAll().map((e) => e.id);
    expect(ids).not.toContain("a");
    expect(ids).toContain("d");
  });

  it("TTL eviction — old errors cleaned on push", () => {
    const buf = createFrontendErrorBuffer(10, 1000); // 1s TTL
    buf.push(makeFrontendError({ timestamp: Date.now() - 2000 })); // expired
    buf.push(makeFrontendError({ timestamp: Date.now() })); // fresh

    expect(buf.size()).toBe(1);
  });

  it("getByUrl — case-insensitive partial URL matching", () => {
    const buf = createFrontendErrorBuffer(10);
    buf.push(makeFrontendError({ url: "http://localhost:3000/API/Users" }));
    buf.push(makeFrontendError({ url: "http://localhost:3000/api/products" }));

    const results = buf.getByUrl("/api/users");
    expect(results).toHaveLength(1);
  });

  it("clear — empties the buffer", () => {
    const buf = createFrontendErrorBuffer(10);
    buf.push(makeFrontendError());
    buf.push(makeFrontendError());
    buf.clear();
    expect(buf.size()).toBe(0);
    expect(buf.getAll()).toEqual([]);
  });

  it("size — returns current count", () => {
    const buf = createFrontendErrorBuffer(10);
    expect(buf.size()).toBe(0);
    buf.push(makeFrontendError());
    expect(buf.size()).toBe(1);
  });

  it("getAll — returns newest first", () => {
    const buf = createFrontendErrorBuffer(10);
    const now = Date.now();
    buf.push(makeFrontendError({ timestamp: now - 2000 }));
    buf.push(makeFrontendError({ timestamp: now }));
    buf.push(makeFrontendError({ timestamp: now - 1000 }));

    const all = buf.getAll();
    expect(all[0].timestamp).toBeGreaterThanOrEqual(all[1].timestamp);
    expect(all[1].timestamp).toBeGreaterThanOrEqual(all[2].timestamp);
  });
});
