/**
 * Unit tests for frontend-backend correlation engine.
 *
 * Tests the matching algorithm that pairs FrontendErrors with backend
 * RuntimeEvents using trace IDs and URL+timestamp proximity.
 *
 * @see src/correlation/fe-be-correlation.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { correlateFrontendBackend } from "@/correlation/fe-be-correlation.js";
import type { FrontendError } from "@/correlation/types.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeFE(overrides: Partial<FrontendError> = {}): FrontendError {
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

function makeBE(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source: "server-stderr",
    service: "main",
    level: "error",
    message: "TypeError at /api/users",
    fingerprint: `fp:${crypto.randomUUID()}`,
    signal_score: 50,
    signal_strength: "high",
    context: {},
    raw: "TypeError at /api/users",
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

describe("frontend-backend correlation engine", () => {
  it("trace ID match → confidence 1.0, method trace-id", () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const fe = [makeFE({ traceId })];
    const be = [makeBE({ context: { trace_id: traceId } })];

    const results = correlateFrontendBackend(fe, be);
    expect(results).toHaveLength(1);
    expect(results[0].correlation_confidence).toBe(1.0);
    expect(results[0].match_method).toBe("trace-id");
  });

  it("exact path + close timestamp (<500ms) → confidence 0.9", () => {
    const now = Date.now();
    const fe = [makeFE({ path: "/api/users", timestamp: now })];
    const be = [makeBE({ message: "Error at /api/users", timestamp: now + 200 })];

    const results = correlateFrontendBackend(fe, be);
    expect(results).toHaveLength(1);
    expect(results[0].correlation_confidence).toBe(0.9);
    expect(results[0].match_method).toBe("url-timestamp");
  });

  it("exact path + far timestamp (<2000ms) → confidence 0.7", () => {
    const now = Date.now();
    const fe = [makeFE({ path: "/api/users", timestamp: now })];
    const be = [makeBE({ message: "Error at /api/users", timestamp: now + 1500 })];

    const results = correlateFrontendBackend(fe, be);
    expect(results).toHaveLength(1);
    expect(results[0].correlation_confidence).toBe(0.7);
  });

  it("no match - timestamps >2s apart → no correlation", () => {
    const now = Date.now();
    const fe = [makeFE({ path: "/api/users", timestamp: now })];
    const be = [makeBE({ message: "Error at /api/users", timestamp: now + 5000 })];

    const results = correlateFrontendBackend(fe, be);
    expect(results).toHaveLength(0);
  });

  it("empty buffers → empty array", () => {
    expect(correlateFrontendBackend([], [])).toEqual([]);
  });

  it("trace ID match takes priority over URL+timestamp", () => {
    const now = Date.now();
    const traceId = "abc123def456abc123def456abc123de";
    const fe = [makeFE({ traceId, path: "/api/users", timestamp: now })];
    const be = [
      makeBE({ context: { trace_id: traceId }, message: "Error", timestamp: now + 100 }),
    ];

    const results = correlateFrontendBackend(fe, be);
    expect(results).toHaveLength(1);
    expect(results[0].match_method).toBe("trace-id");
  });

  it("results ordered by timestamp descending", () => {
    const now = Date.now();
    const fe = [
      makeFE({ path: "/api/a", timestamp: now - 1000 }),
      makeFE({ path: "/api/b", timestamp: now }),
    ];
    const be = [
      makeBE({ message: "Error at /api/a", timestamp: now - 800 }),
      makeBE({ message: "Error at /api/b", timestamp: now + 200 }),
    ];

    const results = correlateFrontendBackend(fe, be);
    expect(results.length).toBeGreaterThanOrEqual(1);
    if (results.length > 1) {
      expect(results[0].frontend_error.timestamp).toBeGreaterThanOrEqual(
        results[1].frontend_error.timestamp,
      );
    }
  });
});
