/**
 * Integration tests for get_error_context MCP tool handler.
 *
 * @see src/tools/get-error-context.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { handleGetErrorContext } from "@/tools/get-error-context.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source: "server-stderr",
    service: "main",
    level: "error",
    message: "test error",
    fingerprint: `fp:${crypto.randomUUID()}`,
    signal_score: 50,
    signal_strength: "high",
    context: {},
    raw: "test error raw",
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

describe("get_error_context MCP tool", () => {
  it("returns error, surrounding_logs, occurrence_count for known fingerprint", () => {
    const buffer = createRingBuffer(100);
    const base = Date.now();
    const fp = "fp:target";

    buffer.push(makeEvent({ timestamp: base - 2000, fingerprint: "fp:before" }));
    buffer.push(makeEvent({ timestamp: base, fingerprint: fp }));
    buffer.push(makeEvent({ timestamp: base + 1000, fingerprint: "fp:after" }));

    const result = handleGetErrorContext(buffer, { fingerprint: fp });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.error).not.toBeNull();
    expect(data.error.fingerprint).toBe(fp);
    expect(data.occurrence_count).toBe(1);
    expect(Array.isArray(data.surrounding_logs)).toBe(true);
  });

  it("returns structured error for unknown fingerprint", () => {
    const buffer = createRingBuffer(100);
    const result = handleGetErrorContext(buffer, { fingerprint: "fp:unknown" });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.error).toBeNull();
    expect(data.occurrence_count).toBe(0);
    expect(data.message).toContain("fp:unknown");
  });

  it("surrounding_logs excludes the error itself", () => {
    const buffer = createRingBuffer(100);
    const base = Date.now();
    const fp = "fp:target";

    buffer.push(makeEvent({ timestamp: base - 1000, fingerprint: "fp:ctx" }));
    buffer.push(makeEvent({ timestamp: base, fingerprint: fp }));

    const result = handleGetErrorContext(buffer, { fingerprint: fp });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.surrounding_logs.every((e: RuntimeEvent) => e.fingerprint !== fp)).toBe(true);
  });

  it("surrounding_logs are within ±5 second window", () => {
    const buffer = createRingBuffer(100);
    const base = Date.now();
    const fp = "fp:target";

    buffer.push(makeEvent({ timestamp: base - 10000, fingerprint: "fp:far-before" }));
    buffer.push(makeEvent({ timestamp: base - 3000, fingerprint: "fp:near-before" }));
    buffer.push(makeEvent({ timestamp: base, fingerprint: fp }));
    buffer.push(makeEvent({ timestamp: base + 2000, fingerprint: "fp:near-after" }));
    buffer.push(makeEvent({ timestamp: base + 10000, fingerprint: "fp:far-after" }));

    const result = handleGetErrorContext(buffer, { fingerprint: fp });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.surrounding_logs).toHaveLength(2); // near-before and near-after
  });

  it("returns MCP error when fingerprint param is missing", () => {
    const buffer = createRingBuffer(100);
    const result = handleGetErrorContext(buffer, {});
    expect(result.isError).toBe(true);
  });
});
