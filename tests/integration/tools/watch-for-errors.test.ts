/**
 * Integration tests for watch_for_errors MCP tool handler.
 *
 * Tests the tool handler with a real event buffer, verifying MCP response
 * format, source filtering, default duration, and error handling.
 *
 * @see src/tools/watch-for-errors.ts for the implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { handleWatchForErrors } from "@/tools/watch-for-errors.js";
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

describe("watch_for_errors MCP tool", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns correct MCP response format", async () => {
    const buffer = createRingBuffer(100);
    const promise = handleWatchForErrors(buffer, { duration_seconds: 2 });

    buffer.push(makeEvent({ level: "error" }));
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const data = JSON.parse(result.content[0].text as string);
    expect(data.events).toHaveLength(1);
    expect(typeof data.watch_duration_ms).toBe("number");
    expect(typeof data.hot_reload_detected).toBe("boolean");
  });

  it("filters by source", async () => {
    const buffer = createRingBuffer(100);
    const promise = handleWatchForErrors(buffer, {
      duration_seconds: 2,
      source: "server-stderr",
    });

    buffer.push(makeEvent({ level: "error", source: "server-stdout" }));
    buffer.push(makeEvent({ level: "error", source: "server-stderr" }));

    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;
    const data = JSON.parse(result.content[0].text as string);
    expect(data.events).toHaveLength(1);
  });

  it("uses default duration when not specified", async () => {
    const buffer = createRingBuffer(100);
    const promise = handleWatchForErrors(buffer, {});

    await vi.advanceTimersByTimeAsync(16000);
    const result = await promise;
    const data = JSON.parse(result.content[0].text as string);
    expect(data.watch_duration_ms).toBeGreaterThanOrEqual(15000);
  });

  it("returns MCP error for invalid duration", async () => {
    const buffer = createRingBuffer(100);
    const result = await handleWatchForErrors(buffer, { duration_seconds: 0 });
    expect(result.isError).toBe(true);
  });

  it("returns MCP error for duration > 120", async () => {
    const buffer = createRingBuffer(100);
    const result = await handleWatchForErrors(buffer, { duration_seconds: 200 });
    expect(result.isError).toBe(true);
  });
});
