/**
 * Unit tests for event buffer subscription capability.
 *
 * Tests the subscribe/unsubscribe mechanism added to the ring buffer
 * for Phase 2's watch_for_errors tool. Subscribers receive events
 * synchronously on push(), and errors in one subscriber don't affect others.
 *
 * @see src/store/ring-buffer.ts for the implementation
 * @see src/types/collectors.ts for the EventBuffer interface
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import type { RuntimeEvent } from "@/types/events.js";

/** Helper to create a minimal valid RuntimeEvent for testing. */
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

describe("event buffer subscription", () => {
  it("subscribe returns an unsubscribe function", () => {
    const buffer = createRingBuffer(10);
    const unsubscribe = buffer.subscribe(() => {});
    expect(typeof unsubscribe).toBe("function");
  });

  it("subscriber receives new events on push()", () => {
    const buffer = createRingBuffer(10);
    const received: RuntimeEvent[] = [];
    buffer.subscribe((event) => received.push(event));

    const event = makeEvent();
    buffer.push(event);

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe(event.id);
  });

  it("unsubscribe stops event delivery", () => {
    const buffer = createRingBuffer(10);
    const received: RuntimeEvent[] = [];
    const unsubscribe = buffer.subscribe((event) => received.push(event));

    buffer.push(makeEvent());
    expect(received).toHaveLength(1);

    unsubscribe();
    buffer.push(makeEvent());
    expect(received).toHaveLength(1);
  });

  it("multiple subscribers receive the same event", () => {
    const buffer = createRingBuffer(10);
    const received1: RuntimeEvent[] = [];
    const received2: RuntimeEvent[] = [];
    buffer.subscribe((event) => received1.push(event));
    buffer.subscribe((event) => received2.push(event));

    const event = makeEvent();
    buffer.push(event);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect(received1[0].id).toBe(event.id);
    expect(received2[0].id).toBe(event.id);
  });

  it("subscriber errors do not break other subscribers or the buffer", () => {
    const buffer = createRingBuffer(10);
    const received: RuntimeEvent[] = [];

    buffer.subscribe(() => {
      throw new Error("subscriber boom");
    });
    buffer.subscribe((event) => received.push(event));

    const event = makeEvent();
    expect(() => buffer.push(event)).not.toThrow();
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe(event.id);
  });

  it("subscriber is not called for dedup updates", () => {
    const buffer = createRingBuffer(10);
    const received: RuntimeEvent[] = [];
    buffer.subscribe((event) => received.push(event));

    const fp = "fp:dedup-test";
    buffer.push(makeEvent({ fingerprint: fp }));
    buffer.push(makeEvent({ fingerprint: fp }));

    expect(received).toHaveLength(1);
  });

  it("double unsubscribe is safe (no-op)", () => {
    const buffer = createRingBuffer(10);
    const unsubscribe = buffer.subscribe(() => {});
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
  });
});
