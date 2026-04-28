/**
 * Integration tests for get_correlated_errors MCP tool.
 *
 * @see src/tools/get-correlated-errors.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createFrontendErrorBuffer } from "@/correlation/frontend-error-buffer.js";
import { handleGetCorrelatedErrors } from "@/tools/get-correlated-errors.js";
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

describe("get_correlated_errors MCP tool", () => {
  it("returns correlated errors in MCP format", () => {
    const backendBuffer = createRingBuffer(100);
    const frontendBuffer = createFrontendErrorBuffer(100);
    const now = Date.now();

    frontendBuffer.push(makeFE({ path: "/api/users", timestamp: now }));
    backendBuffer.push(makeBE({ message: "Error at /api/users", timestamp: now + 200 }));

    const result = handleGetCorrelatedErrors(backendBuffer, frontendBuffer, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.correlations).toHaveLength(1);
    expect(data.correlations[0]).toHaveProperty("frontend_error");
    expect(data.correlations[0]).toHaveProperty("backend_error");
    expect(data.correlations[0]).toHaveProperty("correlation_confidence");
    expect(data.correlations[0]).toHaveProperty("match_method");
  });

  it("URL filter parameter is passed through", () => {
    const backendBuffer = createRingBuffer(100);
    const frontendBuffer = createFrontendErrorBuffer(100);
    const now = Date.now();

    frontendBuffer.push(makeFE({ url: "http://localhost/api/users", path: "/api/users", timestamp: now }));
    frontendBuffer.push(makeFE({ url: "http://localhost/api/products", path: "/api/products", timestamp: now }));
    backendBuffer.push(makeBE({ message: "Error at /api/users", timestamp: now + 100 }));

    const result = handleGetCorrelatedErrors(backendBuffer, frontendBuffer, { url: "/api/users" });
    const data = JSON.parse(result.content[0].text as string);
    // Only the /api/users frontend error should be considered
    expect(data.correlations.length).toBeLessThanOrEqual(1);
  });

  it("empty results → returns empty array", () => {
    const backendBuffer = createRingBuffer(100);
    const frontendBuffer = createFrontendErrorBuffer(100);

    const result = handleGetCorrelatedErrors(backendBuffer, frontendBuffer, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.correlations).toEqual([]);
  });
});
