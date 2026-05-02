/**
 * Tests for semantic error grouping by file:line.
 *
 * Groups errors sharing the same user-code file:line into a parent
 * error with variant_count, reducing duplicate entries.
 *
 * @see src/pipeline/semantic-grouping.ts for implementation
 */

import { describe, it, expect } from "vitest";
import { groupByLocation } from "@/pipeline/semantic-grouping.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: "test-id",
    timestamp: Date.now(),
    source: "server-stderr",
    service: "main",
    level: "error",
    message: "test error",
    fingerprint: `fp-${Math.random()}`,
    signal_score: 50,
    signal_strength: "high",
    context: {},
    raw: "raw",
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

describe("groupByLocation", () => {
  it("groups errors with same file:line", () => {
    const events = [
      makeEvent({ context: { file: "app.ts", line: 42 }, message: "TypeError: x" }),
      makeEvent({ context: { file: "app.ts", line: 42 }, message: "TypeError: y" }),
      makeEvent({ context: { file: "app.ts", line: 42 }, message: "TypeError: z" }),
      makeEvent({ context: { file: "other.ts", line: 10 }, message: "ReferenceError" }),
    ];

    const grouped = groupByLocation(events);
    // 3 errors at app.ts:42 become 1 group + 1 standalone
    expect(grouped).toHaveLength(2);
    const appGroup = grouped.find(g => g.context.file === "app.ts");
    expect(appGroup).toBeDefined();
    expect(appGroup!.variant_count).toBe(3);
  });

  it("returns events unchanged when no grouping possible", () => {
    const events = [
      makeEvent({ context: { file: "a.ts", line: 1 } }),
      makeEvent({ context: { file: "b.ts", line: 2 } }),
    ];

    const grouped = groupByLocation(events);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].variant_count).toBeUndefined();
  });

  it("keeps highest-scoring event as the group representative", () => {
    const events = [
      makeEvent({ context: { file: "app.ts", line: 42 }, signal_score: 30 }),
      makeEvent({ context: { file: "app.ts", line: 42 }, signal_score: 80 }),
      makeEvent({ context: { file: "app.ts", line: 42 }, signal_score: 50 }),
    ];

    const grouped = groupByLocation(events);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].signal_score).toBe(80);
    expect(grouped[0].variant_count).toBe(3);
  });

  it("skips events without file:line context", () => {
    const events = [
      makeEvent({ context: {} }),
      makeEvent({ context: { file: "app.ts" } }), // no line
      makeEvent({ context: { file: "app.ts", line: 42 } }),
    ];

    const grouped = groupByLocation(events);
    // First two can't be grouped, third is standalone
    expect(grouped).toHaveLength(3);
  });
});
