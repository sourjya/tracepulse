/**
 * Unit tests for trace ID extraction from HTTP response headers.
 *
 * @see src/correlation/trace-id-extractor.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { extractTraceIds } from "@/correlation/trace-id-extractor.js";

describe("trace ID extractor", () => {
  it("extracts trace ID from valid traceparent header", () => {
    const headers = { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" };
    const result = extractTraceIds(headers);
    expect(result.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });

  it("extracts x-datadog-trace-id as-is", () => {
    const headers = { "x-datadog-trace-id": "1234567890" };
    const result = extractTraceIds(headers);
    expect(result.datadogTraceId).toBe("1234567890");
  });

  it("traceparent takes precedence when both present", () => {
    const headers = {
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      "x-datadog-trace-id": "9999",
    };
    const result = extractTraceIds(headers);
    expect(result.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(result.datadogTraceId).toBe("9999");
  });

  it("returns undefined for malformed traceparent (wrong length)", () => {
    const headers = { traceparent: "00-short-00f067aa0ba902b7-01" };
    const result = extractTraceIds(headers);
    expect(result.traceId).toBeUndefined();
  });

  it("returns undefined for malformed traceparent (non-hex)", () => {
    const headers = { traceparent: "00-ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ-00f067aa0ba902b7-01" };
    const result = extractTraceIds(headers);
    expect(result.traceId).toBeUndefined();
  });

  it("returns undefined for missing headers", () => {
    const result = extractTraceIds({});
    expect(result.traceId).toBeUndefined();
    expect(result.datadogTraceId).toBeUndefined();
  });

  it("handles case-insensitive header names", () => {
    const headers = { Traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" };
    const result = extractTraceIds(headers);
    expect(result.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });
});
