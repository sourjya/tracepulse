/**
 * Tests for get_session_insights tool.
 */

import { describe, it, expect } from "vitest";
import { handleGetSessionInsights } from "@/tools/get-session-insights.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
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

describe("handleGetSessionInsights", () => {
  it("detects uninvestigated high-signal errors", () => {
    const buffer = createRingBuffer(100);
    const audit = createAuditBuffer();

    // Push a high-signal error 15 minutes ago
    buffer.push(makeEvent({
      fingerprint: "fp-critical",
      signal_score: 95,
      message: "column does not exist",
      timestamp: Date.now() - 15 * 60 * 1000,
    }));

    const result = handleGetSessionInsights(buffer, audit);
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.uninvestigated_errors.length).toBe(1);
    expect(data.uninvestigated_errors[0].fingerprint).toBe("fp-critical");
    expect(data.recommendations.length).toBeGreaterThan(0);
    expect(data.recommendations[0]).toContain("uninvestigated");
  });

  it("does not flag investigated errors", () => {
    const buffer = createRingBuffer(100);
    const audit = createAuditBuffer();

    buffer.push(makeEvent({
      fingerprint: "fp-investigated",
      signal_score: 95,
      timestamp: Date.now() - 15 * 60 * 1000,
    }));

    // Agent investigated it
    audit.record({
      tool: "get_error_context",
      params: { fingerprint: "fp-investigated" },
      response_tokens: 3000, duration_ms: 5, timestamp: Date.now() - 10 * 60 * 1000,
    });

    const result = handleGetSessionInsights(buffer, audit);
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.uninvestigated_errors.length).toBe(0);
  });

  it("reports tool usage patterns", () => {
    const buffer = createRingBuffer(100);
    const audit = createAuditBuffer();

    for (let i = 0; i < 10; i++) {
      audit.record({ tool: "run_and_watch", params: {}, response_tokens: 1000, duration_ms: 5, timestamp: Date.now() });
    }
    audit.record({ tool: "get_errors", params: {}, response_tokens: 500, duration_ms: 3, timestamp: Date.now() });

    const result = handleGetSessionInsights(buffer, audit);
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.tool_usage.most_called).toContain("run_and_watch");
    expect(data.tool_usage.total_calls).toBe(11);
  });

  it("reports parser stats", () => {
    const buffer = createRingBuffer(100);
    const audit = createAuditBuffer();

    buffer.push(makeEvent({ context: { framework: "python" } }));
    buffer.push(makeEvent({ context: { framework: "python" } }));
    buffer.push(makeEvent({ context: { framework: "node" } }));

    const result = handleGetSessionInsights(buffer, audit);
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.parser_stats[0].parser).toBe("python");
    expect(data.parser_stats[0].hits).toBe(2);
  });

  it("recommends get_project_health when never called", () => {
    const buffer = createRingBuffer(100);
    const audit = createAuditBuffer();

    // Simulate 31+ minutes of session with no health check
    // (buffer.sessionStartedAt is set at creation time, so we just check the recommendation logic)
    const result = handleGetSessionInsights(buffer, audit);
    const data = JSON.parse((result.content[0] as { text: string }).text);

    // Should recommend starting with get_project_health
    expect(data.recommendations.some((r: string) => r.includes("TracePulse tools"))).toBe(true);
  });
});
