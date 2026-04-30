/**
 * Tests for score decay and error lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyScoreDecay } from "@/scoring/score-decay.js";
import { createErrorLifecycle } from "@/store/error-lifecycle.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    timestamp: Date.now(),
    source: "server-stderr",
    level: "error",
    message: "Test error",
    raw: "Test error",
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    signal_score: 60,
    signal_strength: "high" as const,
    occurrence_count: 1,
    context: {},
    ...overrides,
  };
}

describe("applyScoreDecay", () => {
  it("decays transient 401 after 60s", () => {
    const event = makeEvent({
      timestamp: Date.now() - 70_000,
      signal_score: 40,
      occurrence_count: 1,
      context: { http_status: 401 },
    });
    const [decayed] = applyScoreDecay([event]);
    expect(decayed.signal_score).toBe(20); // 40 - 20
  });

  it("does not decay recurring 401s", () => {
    const event = makeEvent({
      timestamp: Date.now() - 70_000,
      signal_score: 40,
      occurrence_count: 5,
      context: { http_status: 401 },
    });
    const [result] = applyScoreDecay([event]);
    expect(result.signal_score).toBe(40); // unchanged
  });

  it("does not decay recent 401s", () => {
    const event = makeEvent({
      timestamp: Date.now() - 10_000,
      signal_score: 40,
      occurrence_count: 1,
      context: { http_status: 401 },
    });
    const [result] = applyScoreDecay([event]);
    expect(result.signal_score).toBe(40); // unchanged
  });

  it("does not decay non-transient status codes", () => {
    const event = makeEvent({
      timestamp: Date.now() - 70_000,
      signal_score: 60,
      occurrence_count: 1,
      context: { http_status: 500 },
    });
    const [result] = applyScoreDecay([event]);
    expect(result.signal_score).toBe(60); // unchanged
  });
});

describe("createErrorLifecycle", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("marks HMR transient as expired after 60s", () => {
    const lc = createErrorLifecycle();
    lc.recordError("fp1", true);
    expect(lc.isExpiredTransient("fp1")).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(lc.isExpiredTransient("fp1")).toBe(true);
  });

  it("does not expire non-HMR errors", () => {
    const lc = createErrorLifecycle();
    lc.recordError("fp1", false);
    vi.advanceTimersByTime(61_000);
    expect(lc.isExpiredTransient("fp1")).toBe(false);
  });

  it("marks error as likely resolved after file change + no recurrence", () => {
    const lc = createErrorLifecycle();
    lc.recordError("fp1");
    vi.advanceTimersByTime(1_000);
    lc.recordFileChange();
    vi.advanceTimersByTime(31_000);
    expect(lc.isLikelyResolved("fp1")).toBe(true);
  });

  it("does not mark as resolved if error recurs after file change", () => {
    const lc = createErrorLifecycle();
    lc.recordError("fp1");
    vi.advanceTimersByTime(1_000);
    lc.recordFileChange();
    vi.advanceTimersByTime(5_000);
    lc.recordError("fp1"); // recurs
    vi.advanceTimersByTime(31_000);
    expect(lc.isLikelyResolved("fp1")).toBe(false);
  });

  it("filterActive removes expired and resolved", () => {
    const lc = createErrorLifecycle();
    lc.recordError("fp-hmr", true);
    lc.recordError("fp-resolved");
    lc.recordError("fp-active");

    vi.advanceTimersByTime(1_000);
    lc.recordFileChange();
    vi.advanceTimersByTime(61_000);

    // fp-active recurs
    lc.recordError("fp-active");

    const events = [
      makeEvent({ fingerprint: "fp-hmr" }),
      makeEvent({ fingerprint: "fp-resolved" }),
      makeEvent({ fingerprint: "fp-active" }),
    ];

    const active = lc.filterActive(events);
    expect(active.length).toBe(1);
    expect(active[0].fingerprint).toBe("fp-active");
  });
});
