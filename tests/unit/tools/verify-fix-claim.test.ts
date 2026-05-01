/**
 * Tests for verify_fix claim-checking.
 */

import { describe, it, expect } from "vitest";
import { handleVerifyFix } from "@/tools/verify-fix.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source: "server-stderr",
    service: "main",
    level: "error",
    message: "Test error",
    raw: "Test error",
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    signal_score: 60,
    signal_strength: "high" as const,
    occurrence_count: 1,
    first_seen: Date.now(),
    context: {},
    ...overrides,
  };
}

describe("handleVerifyFix claim-checking", () => {
  it("reports claim resolved when fingerprint does not recur", async () => {
    const buffer = createRingBuffer(100);
    // Pre-existing error
    buffer.push(makeEvent({ fingerprint: "fp-target", occurrence_count: 5 }));

    const result = await handleVerifyFix(buffer, {
      duration_seconds: 1,
      fingerprint: "fp-target",
    });

    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.verdict).toBe("PASS");
    expect(data.claim).toBeDefined();
    expect(data.claim.resolved).toBe(true);
    expect(data.claim.recurred_during_watch).toBe(false);
    expect(data.summary).toContain("target error resolved");
  });

  it("reports PASS without claim when no fingerprint provided", async () => {
    const buffer = createRingBuffer(100);
    const result = await handleVerifyFix(buffer, { duration_seconds: 1 });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.verdict).toBe("PASS");
    expect(data.claim).toBeUndefined();
  });

  it("includes prior_occurrences in claim", async () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ fingerprint: "fp-target", occurrence_count: 42 }));

    const result = await handleVerifyFix(buffer, {
      duration_seconds: 1,
      fingerprint: "fp-target",
    });

    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.claim.prior_occurrences).toBe(42);
  });
});
