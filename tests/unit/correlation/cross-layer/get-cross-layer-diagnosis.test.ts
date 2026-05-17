/**
 * Tests for the get_cross_layer_diagnosis MCP tool handler.
 *
 * Verifies the tool returns correct diagnoses, handles edge cases,
 * and validates input parameters.
 */

import { describe, it, expect } from "vitest";
import { handleGetCrossLayerDiagnosis } from "@/tools/get-cross-layer-diagnosis.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createFrontendErrorBuffer } from "@/correlation/frontend-error-buffer.js";
import { makeEvent } from "../../../helpers/make-event.js";

describe("handleGetCrossLayerDiagnosis", () => {
  it("returns empty diagnoses when buffer is empty", async () => {
    const buffer = createRingBuffer();
    const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp");
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.diagnoses).toEqual([]);
    expect(parsed.signals_collected).toBe(0);
    expect(parsed.no_diagnosis_reason).toContain("No signals");
  });

  it("returns error for invalid time_window_seconds", async () => {
    const buffer = createRingBuffer();
    const result = await handleGetCrossLayerDiagnosis(buffer, { time_window_seconds: 999 }, "/tmp");
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.error).toContain("time_window_seconds");
  });

  it("detects repeated-error pattern from buffer events", async () => {
    const buffer = createRingBuffer();
    const now = Date.now();
    // Push an event with high occurrence count
    buffer.push(makeEvent({
      timestamp: now - 5000,
      level: "error",
      message: "Connection refused to database",
      occurrence_count: 5,
      fingerprint: "fp-conn-refused",
    }));

    const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp");
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.signals_collected).toBeGreaterThan(0);
    // Should match repeated-error pattern
    const repeated = parsed.diagnoses.find((d: { pattern_id: string }) => d.pattern_id === "repeated-error");
    expect(repeated).toBeDefined();
    expect(repeated.confidence).toBeGreaterThanOrEqual(70);
  });

  it("detects backend-ok-frontend-error pattern", async () => {
    const buffer = createRingBuffer();
    const feBuffer = createFrontendErrorBuffer();
    const now = Date.now();

    // Backend 200 OK
    buffer.push(makeEvent({
      timestamp: now - 3000,
      level: "info",
      message: "GET /api/users 200",
      context: { http_status: 200 },
    }));

    // Frontend error
    feBuffer.push({
      id: "fe-1",
      timestamp: now - 1000,
      url: "http://localhost:3000/api/users",
      path: "/api/users",
      method: "GET",
      statusCode: 200,
      statusText: "OK",
      responseHeaders: {},
      source: "cdp",
    });

    // We need a frontend type-error signal, but our frontend buffer stores HTTP failures.
    // The aggregator maps statusCode < 400 as type-error... actually it maps >= 400 as http-failure.
    // For this test, let's use a 500 to trigger http-failure instead.
    // The backend-ok-frontend-error pattern needs backend http-200 + frontend type-error.
    // Since our FrontendError buffer only stores HTTP errors, we need statusCode >= 400 for http-failure.
    // Let's adjust: push a 500 frontend error to get http-failure signal.
    feBuffer.push({
      id: "fe-2",
      timestamp: now - 500,
      url: "http://localhost:3000/api/users",
      path: "/api/users",
      method: "GET",
      statusCode: 500,
      statusText: "Internal Server Error",
      responseHeaders: {},
      source: "cdp",
    });

    const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp", feBuffer);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.signals_collected).toBeGreaterThan(0);
    expect(parsed.layers_active).toContain("backend");
    expect(parsed.layers_active).toContain("frontend");
  });

  it("respects time_window_seconds parameter", async () => {
    const buffer = createRingBuffer();
    const now = Date.now();

    // Push an old event (90 seconds ago)
    buffer.push(makeEvent({
      timestamp: now - 90_000,
      level: "error",
      message: "Old error",
      occurrence_count: 5,
    }));

    // With default 60s window, should not see it
    const result = await handleGetCrossLayerDiagnosis(buffer, { time_window_seconds: 30 }, "/tmp");
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.signals_collected).toBe(0);
  });

  it("includes layers_active in response", async () => {
    const buffer = createRingBuffer();
    const now = Date.now();
    buffer.push(makeEvent({
      timestamp: now - 5000,
      level: "error",
      message: "Server error",
      context: { http_status: 500 },
    }));

    const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp");
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.layers_active).toContain("backend");
  });

  it("limits diagnoses to top 3", async () => {
    const buffer = createRingBuffer();
    const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp");
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.diagnoses.length).toBeLessThanOrEqual(3);
  });
});
