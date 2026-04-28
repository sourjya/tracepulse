/**
 * Unit tests for notification dispatcher.
 *
 * @see src/notifications/notification-dispatcher.ts
 */

import { describe, it, expect } from "vitest";
import { createNotificationDispatcher } from "@/notifications/notification-dispatcher.js";
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
    signal_score: 75,
    signal_strength: "high",
    context: {},
    raw: "test error raw",
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

describe("notification dispatcher", () => {
  it("shouldNotify returns true for new fingerprint + high signal", () => {
    const dispatcher = createNotificationDispatcher(() => true);
    expect(dispatcher.shouldNotify(makeEvent({ signal_strength: "high" }))).toBe(true);
  });

  it("shouldNotify returns false for known fingerprint", () => {
    const dispatcher = createNotificationDispatcher(() => false);
    expect(dispatcher.shouldNotify(makeEvent({ signal_strength: "high" }))).toBe(false);
  });

  it("shouldNotify returns false for low/medium signal", () => {
    const dispatcher = createNotificationDispatcher(() => true);
    expect(dispatcher.shouldNotify(makeEvent({ signal_strength: "low" }))).toBe(false);
    expect(dispatcher.shouldNotify(makeEvent({ signal_strength: "medium" }))).toBe(false);
  });

  it("deduplication: same fingerprint only triggers once", () => {
    const dispatcher = createNotificationDispatcher(() => true);
    const fp = "fp:dedup";
    const event = makeEvent({ fingerprint: fp, signal_strength: "high" });

    expect(dispatcher.shouldNotify(event)).toBe(true);
    dispatcher.markNotified(fp);
    expect(dispatcher.shouldNotify(event)).toBe(false);
  });

  it("buildPayload produces token-efficient payload", () => {
    const dispatcher = createNotificationDispatcher(() => true);
    const payload = dispatcher.buildPayload(makeEvent({ message: "x".repeat(300) }));
    expect(payload.message.length).toBeLessThanOrEqual(200);
    expect(payload).toHaveProperty("fingerprint");
    expect(payload).toHaveProperty("signal_strength");
    expect(payload).toHaveProperty("source");
    expect(payload).toHaveProperty("timestamp");
  });
});
