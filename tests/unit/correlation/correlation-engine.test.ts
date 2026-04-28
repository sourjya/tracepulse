/**
 * Unit tests for cross-service correlation engine.
 *
 * @see src/correlation/correlation-engine.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { correlateEvents } from "@/correlation/correlation-engine.js";
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

describe("correlation engine", () => {
  it("events from two services within window get same correlation_group", () => {
    const base = 1000000;
    const events = [
      makeEvent({ service: "api", timestamp: base }),
      makeEvent({ service: "worker", timestamp: base + 500 }),
    ];

    const result = correlateEvents(events, 2000);
    const groups = result.filter((e) => e.correlation_group);
    expect(groups).toHaveLength(2);
    expect(groups[0].correlation_group).toBe(groups[1].correlation_group);
  });

  it("events from two services separated by >window get different groups", () => {
    const base = 1000000;
    const events = [
      makeEvent({ service: "api", timestamp: base }),
      makeEvent({ service: "worker", timestamp: base + 5000 }),
    ];

    const result = correlateEvents(events, 2000);
    const withGroup = result.filter((e) => e.correlation_group);
    // Events too far apart - no cross-service group
    expect(withGroup).toHaveLength(0);
  });

  it("events from a single service get no correlation_group", () => {
    const base = 1000000;
    const events = [
      makeEvent({ service: "api", timestamp: base }),
      makeEvent({ service: "api", timestamp: base + 500 }),
    ];

    const result = correlateEvents(events, 2000);
    expect(result.every((e) => !e.correlation_group)).toBe(true);
  });

  it("empty event list returns empty result", () => {
    expect(correlateEvents([], 2000)).toEqual([]);
  });

  it("single event returns no correlation group", () => {
    const result = correlateEvents([makeEvent()], 2000);
    expect(result).toHaveLength(1);
    expect(result[0].correlation_group).toBeUndefined();
  });

  it("events are sorted by timestamp in output", () => {
    const base = 1000000;
    const events = [
      makeEvent({ service: "api", timestamp: base + 2000 }),
      makeEvent({ service: "worker", timestamp: base }),
      makeEvent({ service: "api", timestamp: base + 1000 }),
    ];

    const result = correlateEvents(events, 5000);
    expect(result[0].timestamp).toBeLessThanOrEqual(result[1].timestamp);
    expect(result[1].timestamp).toBeLessThanOrEqual(result[2].timestamp);
  });

  it("respects custom correlation_window_ms", () => {
    const base = 1000000;
    const events = [
      makeEvent({ service: "api", timestamp: base }),
      makeEvent({ service: "worker", timestamp: base + 150 }),
    ];

    // Window of 100ms - events 150ms apart should NOT correlate
    const result = correlateEvents(events, 100);
    expect(result.every((e) => !e.correlation_group)).toBe(true);

    // Window of 200ms - events 150ms apart SHOULD correlate
    const result2 = correlateEvents(events, 200);
    const withGroup = result2.filter((e) => e.correlation_group);
    expect(withGroup).toHaveLength(2);
  });
});
