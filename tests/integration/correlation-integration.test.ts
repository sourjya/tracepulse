/**
 * Integration tests for get_errors with correlation.
 *
 * @see src/mcp/server.ts for handleGetErrors
 * @see src/correlation/correlation-engine.ts for correlateEvents
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { handleGetErrors } from "@/mcp/server.js";
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

describe("get_errors with correlation", () => {
  it("includes correlation_group on cross-service events", () => {
    const buffer = createRingBuffer(100);
    const base = Date.now();
    buffer.push(makeEvent({ service: "api", timestamp: base, level: "error" }));
    buffer.push(makeEvent({ service: "worker", timestamp: base + 500, level: "error" }));

    const result = handleGetErrors(buffer, {});
    const data = JSON.parse(result.content[0].text as string);
    const withGroup = data.errors.filter((e: any) => e.correlation_group);
    expect(withGroup.length).toBe(2);
  });

  it("single-process mode: no correlation_group on events", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ service: "main", level: "error" }));
    buffer.push(makeEvent({ service: "main", level: "error" }));

    const result = handleGetErrors(buffer, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors.every((e: any) => !e.correlation_group)).toBe(true);
  });
});
