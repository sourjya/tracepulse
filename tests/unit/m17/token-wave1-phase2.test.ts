/**
 * Tests for M17 Phase 2-4: delta responses, verbosity, environmental report.
 *
 * @see .kiro/specs/m17-token-wave1/requirements.md W1.2, W1.5, W1.7
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { computeBufferHash } from "@/pipeline/delta-response.js";
import { handleGetSessionImpact } from "@/tools/get-session-impact.js";
import { createAuditBuffer } from "@/store/audit-buffer.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  const now = Date.now();
  return {
    id: crypto.randomUUID(), timestamp: now, source: "server-stderr", service: "main",
    level: "error", message: "Test error", raw: "Test error",
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    signal_score: 60, signal_strength: "high" as const,
    occurrence_count: 1, first_seen: now, context: {},
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// W1.2: No-Change Delta Responses
// ──────────────────────────────────────────────

describe("Buffer Hash for Delta Responses (W1.2)", () => {
  it("returns same hash when buffer unchanged", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent());
    const h1 = computeBufferHash(buffer);
    const h2 = computeBufferHash(buffer);
    expect(h1).toBe(h2);
  });

  it("returns different hash after new event", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent());
    const h1 = computeBufferHash(buffer);
    buffer.push(makeEvent());
    const h2 = computeBufferHash(buffer);
    expect(h1).not.toBe(h2);
  });

  it("returns different hash after clear", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent());
    const h1 = computeBufferHash(buffer);
    buffer.clear();
    const h2 = computeBufferHash(buffer);
    expect(h1).not.toBe(h2);
  });
});

// ──────────────────────────────────────────────
// W1.7: Environmental Report
// ──────────────────────────────────────────────

describe("Environmental Report (W1.7)", () => {
  it("calculates token savings and energy impact", () => {
    const audit = createAuditBuffer();
    // Simulate 10 tool calls with response tokens
    for (let i = 0; i < 10; i++) {
      audit.record({ tool: "get_errors", params: {}, response_tokens: 1000, duration_ms: 5, timestamp: Date.now() });
    }

    const result = handleGetSessionImpact(audit);
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.total_tool_calls).toBe(10);
    expect(data.total_response_tokens).toBe(10000);
    expect(data.estimated_tokens_saved).toBeGreaterThan(0);
    expect(data.energy_saved_wh).toBeGreaterThan(0);
    expect(data.co2_saved_g).toBeGreaterThan(0);
  });

  it("returns zero impact for empty session", () => {
    const audit = createAuditBuffer();
    const result = handleGetSessionImpact(audit);
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.total_tool_calls).toBe(0);
    expect(data.estimated_tokens_saved).toBe(0);
  });
});
