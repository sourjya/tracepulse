/**
 * Integration tests for get_build_errors MCP tool handler.
 *
 * @see src/tools/get-build-errors.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { handleGetBuildErrors } from "@/tools/get-build-errors.js";
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

describe("get_build_errors MCP tool", () => {
  it("returns only build-error source events", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ source: "build-error" }));
    buffer.push(makeEvent({ source: "server-stderr" }));
    buffer.push(makeEvent({ source: "build-error" }));

    const result = handleGetBuildErrors(buffer, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(2);
    expect(data.errors.every((e: RuntimeEvent) => e.source === "build-error")).toBe(true);
  });

  it("respects limit parameter", () => {
    const buffer = createRingBuffer(100);
    for (let i = 0; i < 5; i++) {
      buffer.push(makeEvent({ source: "build-error" }));
    }

    const result = handleGetBuildErrors(buffer, { limit: 2 });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(2);
  });

  it("returns empty array when no build errors", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ source: "server-stderr" }));

    const result = handleGetBuildErrors(buffer, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toEqual([]);
    expect(data.total_count).toBe(0);
  });

  it("includes total_count in response", () => {
    const buffer = createRingBuffer(100);
    for (let i = 0; i < 5; i++) {
      buffer.push(makeEvent({ source: "build-error" }));
    }

    const result = handleGetBuildErrors(buffer, { limit: 2 });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.total_count).toBe(5);
  });

  it("returns correct MCP response format", () => {
    const buffer = createRingBuffer(100);
    const result = handleGetBuildErrors(buffer, {});
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });
});
