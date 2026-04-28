/**
 * Unit tests for the ring buffer event store.
 *
 * Verifies circular buffer behavior, fingerprint-based deduplication,
 * FIFO eviction at capacity, and filtered querying with minimum-level
 * semantics. Uses a makeEvent helper to produce valid RuntimeEvents
 * with sensible defaults.
 *
 * @see src/store/ring-buffer.ts for implementation
 * @see src/types/collectors.ts for the EventBuffer interface
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer";
import type { RuntimeEvent, EventSource, LogLevel } from "@/types/events";
import { LOG_LEVEL_SEVERITY } from "@/constants/events";

// ──────────────────────────────────────────────
// Test Helper
// ──────────────────────────────────────────────

let eventCounter = 0;

/**
 * Create a valid RuntimeEvent with sensible defaults.
 * Every call produces a unique id and fingerprint unless overridden.
 */
function makeEvent(
  overrides: Partial<RuntimeEvent> = {},
): RuntimeEvent {
  eventCounter++;
  return {
    id: `evt-${eventCounter}`,
    timestamp: Date.now(),
    source: "server-stderr" as EventSource,
    service: "main",
    level: "error" as LogLevel,
    message: `Test error ${eventCounter}`,
    fingerprint: `fp-${eventCounter}`,
    signal_score: 75,
    signal_strength: "high",
    context: {},
    raw: `raw log line ${eventCounter}`,
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

describe("createRingBuffer", () => {
  // ──────────────────────────────────────────────
  // Basic push and retrieve
  // ──────────────────────────────────────────────

  it("pushes and retrieves a single event", () => {
    const buffer = createRingBuffer(10);
    const event = makeEvent();
    buffer.push(event);

    const results = buffer.query({});
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(event.id);
  });

  it("returns empty array from empty buffer", () => {
    const buffer = createRingBuffer(10);
    const results = buffer.query({});
    expect(results).toEqual([]);
  });

  // ──────────────────────────────────────────────
  // Size property
  // ──────────────────────────────────────────────

  it("size reflects current event count", () => {
    const buffer = createRingBuffer(10);
    expect(buffer.size).toBe(0);

    buffer.push(makeEvent());
    expect(buffer.size).toBe(1);

    buffer.push(makeEvent());
    expect(buffer.size).toBe(2);
  });

  // ──────────────────────────────────────────────
  // FIFO eviction
  // ──────────────────────────────────────────────

  it("evicts oldest event when capacity is exceeded", () => {
    const buffer = createRingBuffer(500);
    const events: RuntimeEvent[] = [];

    // Push 501 events — the first should be evicted
    for (let i = 0; i < 501; i++) {
      const evt = makeEvent({ timestamp: 1000 + i });
      events.push(evt);
      buffer.push(evt);
    }

    expect(buffer.size).toBe(500);

    const results = buffer.query({});
    // Oldest event (index 0) should be gone
    const fingerprints = results.map((e) => e.fingerprint);
    expect(fingerprints).not.toContain(events[0].fingerprint);
    // Most recent should be present
    expect(fingerprints).toContain(events[500].fingerprint);
  });

  it("handles rapid pushes without memory growth (1000 into 500)", () => {
    const buffer = createRingBuffer(500);

    for (let i = 0; i < 1000; i++) {
      buffer.push(makeEvent({ timestamp: 1000 + i }));
    }

    expect(buffer.size).toBe(500);
    const results = buffer.query({});
    expect(results).toHaveLength(500);
  });

  // ──────────────────────────────────────────────
  // Deduplication
  // ──────────────────────────────────────────────

  it("increments occurrence_count on duplicate fingerprint", () => {
    const buffer = createRingBuffer(10);
    const fp = "dup-fingerprint";

    buffer.push(makeEvent({ fingerprint: fp, timestamp: 1000 }));
    buffer.push(makeEvent({ fingerprint: fp, timestamp: 2000 }));
    buffer.push(makeEvent({ fingerprint: fp, timestamp: 3000 }));

    const results = buffer.query({});
    expect(results).toHaveLength(1);
    expect(results[0].occurrence_count).toBe(3);
    expect(results[0].timestamp).toBe(3000);
  });

  it("does NOT change first_seen on duplicate", () => {
    const buffer = createRingBuffer(10);
    const fp = "dup-first-seen";
    const originalFirstSeen = 1000;

    buffer.push(
      makeEvent({ fingerprint: fp, timestamp: 1000, first_seen: originalFirstSeen }),
    );
    buffer.push(
      makeEvent({ fingerprint: fp, timestamp: 5000, first_seen: 5000 }),
    );

    const results = buffer.query({});
    expect(results[0].first_seen).toBe(originalFirstSeen);
  });

  it("treats stale fingerprint pointer as new event after FIFO eviction", () => {
    const buffer = createRingBuffer(5);
    const staleFp = "stale-fp";

    // Push the event that will be evicted
    buffer.push(makeEvent({ fingerprint: staleFp, timestamp: 1000 }));

    // Push 5 more events to evict the stale one
    for (let i = 0; i < 5; i++) {
      buffer.push(makeEvent({ timestamp: 2000 + i }));
    }

    // Now push with the same fingerprint — should be treated as new
    buffer.push(makeEvent({ fingerprint: staleFp, timestamp: 9000 }));

    const results = buffer.query({});
    const staleEvents = results.filter((e) => e.fingerprint === staleFp);
    expect(staleEvents).toHaveLength(1);
    // Should be a fresh event, not a dedup update
    expect(staleEvents[0].occurrence_count).toBe(1);
    expect(staleEvents[0].timestamp).toBe(9000);
  });

  // ──────────────────────────────────────────────
  // Query: since filter
  // ──────────────────────────────────────────────

  it("filters events by since timestamp", () => {
    const buffer = createRingBuffer(10);
    buffer.push(makeEvent({ timestamp: 1000 }));
    buffer.push(makeEvent({ timestamp: 2000 }));
    buffer.push(makeEvent({ timestamp: 3000 }));

    const results = buffer.query({ since: 1500 });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.timestamp > 1500)).toBe(true);
  });

  // ──────────────────────────────────────────────
  // Query: source filter
  // ──────────────────────────────────────────────

  it("filters events by source (exact match)", () => {
    const buffer = createRingBuffer(10);
    buffer.push(makeEvent({ source: "server-stdout" }));
    buffer.push(makeEvent({ source: "server-stderr" }));
    buffer.push(makeEvent({ source: "server-stdout" }));

    const results = buffer.query({ source: "server-stdout" });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.source === "server-stdout")).toBe(true);
  });

  // ──────────────────────────────────────────────
  // Query: level filter (minimum severity)
  // ──────────────────────────────────────────────

  it("filters by minimum level — warn returns error+warn but not info/debug", () => {
    const buffer = createRingBuffer(10);
    buffer.push(makeEvent({ level: "error" }));
    buffer.push(makeEvent({ level: "warn" }));
    buffer.push(makeEvent({ level: "info" }));
    buffer.push(makeEvent({ level: "debug" }));

    const results = buffer.query({ level: "warn" });
    expect(results).toHaveLength(2);

    const levels = results.map((e) => e.level);
    expect(levels).toContain("error");
    expect(levels).toContain("warn");
    expect(levels).not.toContain("info");
    expect(levels).not.toContain("debug");
  });

  it("level=error returns only error events", () => {
    const buffer = createRingBuffer(10);
    buffer.push(makeEvent({ level: "error" }));
    buffer.push(makeEvent({ level: "warn" }));
    buffer.push(makeEvent({ level: "info" }));

    const results = buffer.query({ level: "error" });
    expect(results).toHaveLength(1);
    expect(results[0].level).toBe("error");
  });

  // ──────────────────────────────────────────────
  // Query: limit parameter
  // ──────────────────────────────────────────────

  it("respects limit parameter", () => {
    const buffer = createRingBuffer(10);
    for (let i = 0; i < 5; i++) {
      buffer.push(makeEvent({ timestamp: 1000 + i }));
    }

    const results = buffer.query({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  // ──────────────────────────────────────────────
  // Query: combined filters
  // ──────────────────────────────────────────────

  it("applies combined filters correctly", () => {
    const buffer = createRingBuffer(20);
    // Events that match all filters: source=server-stderr, level>=warn, since>1000
    buffer.push(makeEvent({ source: "server-stderr", level: "error", timestamp: 500 }));   // fails since
    buffer.push(makeEvent({ source: "server-stderr", level: "error", timestamp: 2000 }));  // matches
    buffer.push(makeEvent({ source: "server-stderr", level: "warn", timestamp: 3000 }));   // matches
    buffer.push(makeEvent({ source: "server-stderr", level: "info", timestamp: 4000 }));   // fails level
    buffer.push(makeEvent({ source: "server-stdout", level: "error", timestamp: 5000 }));  // fails source

    const results = buffer.query({
      since: 1000,
      source: "server-stderr",
      level: "warn",
      limit: 10,
    });

    expect(results).toHaveLength(2);
    expect(results.every((e) => e.source === "server-stderr")).toBe(true);
    expect(
      results.every(
        (e) => LOG_LEVEL_SEVERITY[e.level] <= LOG_LEVEL_SEVERITY["warn"],
      ),
    ).toBe(true);
    expect(results.every((e) => e.timestamp > 1000)).toBe(true);
  });

  // ──────────────────────────────────────────────
  // Sorting: newest first
  // ──────────────────────────────────────────────

  it("returns results sorted by timestamp descending (newest first)", () => {
    const buffer = createRingBuffer(10);
    buffer.push(makeEvent({ timestamp: 1000 }));
    buffer.push(makeEvent({ timestamp: 3000 }));
    buffer.push(makeEvent({ timestamp: 2000 }));

    const results = buffer.query({});
    expect(results[0].timestamp).toBe(3000);
    expect(results[1].timestamp).toBe(2000);
    expect(results[2].timestamp).toBe(1000);
  });

  // ──────────────────────────────────────────────
  // count()
  // ──────────────────────────────────────────────

  it("count() returns total events without filters", () => {
    const buffer = createRingBuffer(10);
    buffer.push(makeEvent());
    buffer.push(makeEvent());
    buffer.push(makeEvent());

    expect(buffer.count()).toBe(3);
  });

  it("count() returns filtered count with filters", () => {
    const buffer = createRingBuffer(10);
    buffer.push(makeEvent({ level: "error" }));
    buffer.push(makeEvent({ level: "warn" }));
    buffer.push(makeEvent({ level: "info" }));

    expect(buffer.count({ level: "warn" })).toBe(2);
    expect(buffer.count({ level: "error" })).toBe(1);
  });

  // ──────────────────────────────────────────────
  // clear()
  // ──────────────────────────────────────────────

  it("clear() removes all events and returns count", () => {
    const buffer = createRingBuffer(10);
    buffer.push(makeEvent());
    buffer.push(makeEvent());
    buffer.push(makeEvent());

    const removed = buffer.clear();
    expect(removed).toBe(3);
    expect(buffer.size).toBe(0);
    expect(buffer.query({})).toEqual([]);
  });
});
