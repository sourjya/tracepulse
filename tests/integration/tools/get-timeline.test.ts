/**
 * Integration tests for get_timeline MCP tool handler.
 *
 * @see src/tools/get-timeline.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { handleGetTimeline } from "@/tools/get-timeline.js";
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

describe("get_timeline MCP tool", () => {
  it("returns events in chronological order within time window", () => {
    const buffer = createRingBuffer(100);
    const base = 1000000;
    buffer.push(makeEvent({ timestamp: base + 3000 }));
    buffer.push(makeEvent({ timestamp: base + 1000 }));
    buffer.push(makeEvent({ timestamp: base + 2000 }));

    const result = handleGetTimeline(buffer, { since: base, duration_seconds: 10 });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.events).toHaveLength(3);
    expect(data.events[0].timestamp).toBeLessThanOrEqual(data.events[1].timestamp);
    expect(data.events[1].timestamp).toBeLessThanOrEqual(data.events[2].timestamp);
  });

  it("respects limit and caps at MAX_TIMELINE_LIMIT", () => {
    const buffer = createRingBuffer(100);
    const base = 1000000;
    for (let i = 0; i < 10; i++) {
      buffer.push(makeEvent({ timestamp: base + i * 100 }));
    }

    const result = handleGetTimeline(buffer, { since: base, limit: 3 });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.events).toHaveLength(3);
  });

  it("returns events from since to now when duration_seconds omitted", () => {
    const buffer = createRingBuffer(100);
    const now = Date.now();
    buffer.push(makeEvent({ timestamp: now - 1000 }));
    buffer.push(makeEvent({ timestamp: now - 500 }));

    const result = handleGetTimeline(buffer, { since: now - 2000 });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.events).toHaveLength(2);
  });

  it("response includes window metadata and capped flag", () => {
    const buffer = createRingBuffer(100);
    const result = handleGetTimeline(buffer, { since: 1000000, duration_seconds: 10 });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.window).toBeDefined();
    expect(data.window.from).toBe(1000000);
    expect(data.window.to).toBe(1000000 + 10000);
    expect(typeof data.capped).toBe("boolean");
    expect(typeof data.total_in_window).toBe("number");
  });

  it("returns empty events for future since timestamp", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ timestamp: Date.now() }));

    const result = handleGetTimeline(buffer, { since: Date.now() + 100000 });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.events).toEqual([]);
  });

  it("returns MCP error when since is missing", () => {
    const buffer = createRingBuffer(100);
    const result = handleGetTimeline(buffer, {});
    expect(result.isError).toBe(true);
  });
});
