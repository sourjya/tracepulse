/**
 * Tests for M18 Wave 2: session summary and semantic error grouping.
 *
 * @see .kiro/specs/m18-token-wave2/requirements.md W2.2, W2.6
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createAuditBuffer } from "@/store/audit-buffer.js";
import { handleGetSessionSummary } from "@/tools/get-session-summary.js";
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

describe("Session Summary (W2.2)", () => {
  it("returns compact summary under 300 tokens", () => {
    const buffer = createRingBuffer(100);
    const audit = createAuditBuffer();

    buffer.push(makeEvent({ signal_score: 95, message: "column does not exist" }));
    buffer.push(makeEvent({ signal_score: 30, message: "deprecation warning" }));
    audit.record({ tool: "get_errors", params: {}, response_tokens: 1000, duration_ms: 5, timestamp: Date.now() });
    audit.record({ tool: "verify_fix", params: {}, response_tokens: 500, duration_ms: 5000, timestamp: Date.now() });

    const result = handleGetSessionSummary(buffer, audit);
    const text = (result.content[0] as { text: string }).text;
    const data = JSON.parse(text);

    // Should be compact
    expect(text.length).toBeLessThan(1200); // ~300 tokens at 4 chars/token
    expect(data.errors).toBeDefined();
    expect(data.errors.total_seen).toBe(2);
    expect(data.tools_called).toBe(2);
    expect(data.top_error).toContain("column does not exist");
  });

  it("returns clean summary for empty session", () => {
    const buffer = createRingBuffer(100);
    const audit = createAuditBuffer();

    const result = handleGetSessionSummary(buffer, audit);
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.errors.total_seen).toBe(0);
    expect(data.tools_called).toBe(0);
    expect(data.status).toBe("clean");
  });

  it("tracks acknowledged vs pending errors", () => {
    const buffer = createRingBuffer(100);
    const audit = createAuditBuffer();

    buffer.push(makeEvent({ fingerprint: "fp-ack", signal_score: 80 }));
    buffer.push(makeEvent({ fingerprint: "fp-pending", signal_score: 90 }));
    audit.acknowledge("fp-ack");

    const result = handleGetSessionSummary(buffer, audit);
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.errors.acknowledged).toBe(1);
    expect(data.errors.pending).toBe(1);
  });
});
