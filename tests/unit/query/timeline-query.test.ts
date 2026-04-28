/**
 * Unit tests for timeline query module.
 *
 * Tests time-range queries, surrounding log queries, and occurrence counting
 * against the event buffer. These functions power the get_timeline and
 * get_error_context MCP tools.
 *
 * @see src/query/timeline-query.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import {
  queryTimeline,
  querySurroundingLogs,
  countOccurrences,
} from "@/query/timeline-query.js";
import type { RuntimeEvent } from "@/types/events.js";

/** Helper to create a minimal RuntimeEvent. */
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

describe("queryTimeline", () => {
  it("returns events within time range [since, since + duration]", () => {
    const buffer = createRingBuffer(100);
    const base = 1000000;
    buffer.push(makeEvent({ timestamp: base + 1000 }));
    buffer.push(makeEvent({ timestamp: base + 3000 }));
    buffer.push(makeEvent({ timestamp: base + 6000 }));

    const results = queryTimeline(buffer, base, 5);
    expect(results).toHaveLength(2);
  });

  it("returns events from since to now when no duration", () => {
    const buffer = createRingBuffer(100);
    const now = Date.now();
    buffer.push(makeEvent({ timestamp: now - 1000 }));
    buffer.push(makeEvent({ timestamp: now - 500 }));

    const results = queryTimeline(buffer, now - 2000);
    expect(results).toHaveLength(2);
  });

  it("results are sorted by timestamp ascending", () => {
    const buffer = createRingBuffer(100);
    const base = 1000000;
    buffer.push(makeEvent({ timestamp: base + 3000 }));
    buffer.push(makeEvent({ timestamp: base + 1000 }));
    buffer.push(makeEvent({ timestamp: base + 2000 }));

    const results = queryTimeline(buffer, base, 10);
    expect(results[0].timestamp).toBeLessThanOrEqual(results[1].timestamp);
    expect(results[1].timestamp).toBeLessThanOrEqual(results[2].timestamp);
  });

  it("results are capped at limit", () => {
    const buffer = createRingBuffer(100);
    const base = 1000000;
    for (let i = 0; i < 10; i++) {
      buffer.push(makeEvent({ timestamp: base + i * 1000 }));
    }

    const results = queryTimeline(buffer, base, 20, 3);
    expect(results).toHaveLength(3);
  });

  it("empty buffer returns empty array", () => {
    const buffer = createRingBuffer(100);
    expect(queryTimeline(buffer, 0, 10)).toEqual([]);
  });

  it("since in the future returns empty array", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ timestamp: Date.now() }));

    const results = queryTimeline(buffer, Date.now() + 100000, 10);
    expect(results).toEqual([]);
  });
});

describe("querySurroundingLogs", () => {
  it("returns events within ±window_ms, excluding target", () => {
    const buffer = createRingBuffer(100);
    const base = 1000000;
    const targetFp = "fp:target";

    buffer.push(makeEvent({ timestamp: base - 3000, fingerprint: "fp:before" }));
    buffer.push(makeEvent({ timestamp: base, fingerprint: targetFp }));
    buffer.push(makeEvent({ timestamp: base + 2000, fingerprint: "fp:after" }));
    buffer.push(makeEvent({ timestamp: base + 10000, fingerprint: "fp:far" }));

    const target = buffer.query({}).find((e) => e.fingerprint === targetFp)!;
    const results = querySurroundingLogs(buffer, target, 5000, 50);

    expect(results.every((e) => e.fingerprint !== targetFp)).toBe(true);
    expect(results).toHaveLength(2); // before and after, not far
  });

  it("caps results at maxResults", () => {
    const buffer = createRingBuffer(100);
    const base = 1000000;
    const targetFp = "fp:target";

    for (let i = 0; i < 10; i++) {
      buffer.push(makeEvent({ timestamp: base + i * 100 }));
    }
    buffer.push(makeEvent({ timestamp: base + 500, fingerprint: targetFp }));

    const target = buffer.query({}).find((e) => e.fingerprint === targetFp)!;
    const results = querySurroundingLogs(buffer, target, 5000, 3);
    expect(results).toHaveLength(3);
  });
});

describe("countOccurrences", () => {
  it("counts events matching a fingerprint", () => {
    const buffer = createRingBuffer(100);
    const fp = "fp:counted";
    buffer.push(makeEvent({ fingerprint: fp }));
    // Dedup increments occurrence_count on the existing event
    buffer.push(makeEvent({ fingerprint: fp }));
    buffer.push(makeEvent({ fingerprint: fp }));
    buffer.push(makeEvent({ fingerprint: "fp:other" }));

    // The buffer deduplicates, so there's 1 event with occurrence_count=3
    expect(countOccurrences(buffer, fp)).toBe(3);
  });

  it("returns 0 for unknown fingerprint", () => {
    const buffer = createRingBuffer(100);
    expect(countOccurrences(buffer, "fp:nonexistent")).toBe(0);
  });
});
