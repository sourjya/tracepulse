/**
 * Tests for REST API endpoints on the HTTP transport.
 *
 * @see src/transport/rest-endpoints.ts
 * @see .kiro/specs/m22-http-rest-api/requirements.md
 */

import { describe, it, expect } from "vitest";
import { createRestHandler, type RestDeps } from "@/transport/rest-endpoints.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createAuditBuffer } from "@/store/audit-buffer.js";

/** Minimal deps for testing. */
function makeDeps(): RestDeps {
  return {
    buffer: createRingBuffer(),
    auditBuffer: createAuditBuffer(),
    getConnected: () => true,
    sessionStartedAt: Date.now(),
  };
}

/** Simulate an HTTP request to the handler. */
function mockReq(url: string) {
  return { method: "GET", url } as { method: string; url: string };
}

describe("REST endpoints", () => {
  it("GET /health returns status", () => {
    const handler = createRestHandler(makeDeps());
    const result = handler(mockReq("/health"));
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.body);
    expect(parsed.status).toBe("ok");
    expect(parsed).toHaveProperty("errors");
    expect(parsed).toHaveProperty("uptime_seconds");
  });

  it("GET /api/session returns session summary", () => {
    const handler = createRestHandler(makeDeps());
    const result = handler(mockReq("/api/session"));
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.body);
    expect(parsed).toHaveProperty("errors");
  });

  it("GET /api/errors returns error list", () => {
    const handler = createRestHandler(makeDeps());
    const result = handler(mockReq("/api/errors"));
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.body);
    expect(parsed).toHaveProperty("errors");
  });

  it("GET /api/metrics returns tool counts", () => {
    const handler = createRestHandler(makeDeps());
    const result = handler(mockReq("/api/metrics"));
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!.body);
    expect(parsed).toHaveProperty("tools");
    expect(parsed).toHaveProperty("parsers");
  });

  it("returns null for unknown paths (pass to MCP handler)", () => {
    const handler = createRestHandler(makeDeps());
    const result = handler(mockReq("/mcp/something"));
    expect(result).toBeNull();
  });

  it("returns null for POST requests (MCP protocol)", () => {
    const handler = createRestHandler(makeDeps());
    const result = handler({ method: "POST", url: "/health" } as { method: string; url: string });
    expect(result).toBeNull();
  });
});
