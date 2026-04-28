/**
 * Unit tests for get_errors service filter extension.
 *
 * @see src/mcp/server.ts for handleGetErrors
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

describe("get_errors service filter", () => {
  it("get_errors({ service: 'api' }) returns only events from api", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ service: "api", level: "error" }));
    buffer.push(makeEvent({ service: "worker", level: "error" }));
    buffer.push(makeEvent({ service: "api", level: "error" }));

    const result = handleGetErrors(buffer, { service: "api" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(2);
    expect(data.errors.every((e: any) => e.service === "api")).toBe(true);
  });

  it("get_errors({}) returns events from all services", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ service: "api", level: "error" }));
    buffer.push(makeEvent({ service: "worker", level: "error" }));

    const result = handleGetErrors(buffer, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(2);
  });

  it("get_errors({ service: 'nonexistent' }) returns empty array", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ service: "api", level: "error" }));

    const result = handleGetErrors(buffer, { service: "nonexistent" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(0);
  });

  it("service filter combines with other filters", () => {
    const buffer = createRingBuffer(100);
    const base = Date.now();
    buffer.push(makeEvent({ service: "api", level: "error", timestamp: base - 5000 }));
    buffer.push(makeEvent({ service: "api", level: "error", timestamp: base }));
    buffer.push(makeEvent({ service: "worker", level: "error", timestamp: base }));

    const result = handleGetErrors(buffer, { service: "api", since: base - 1000, limit: 1 });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].service).toBe("api");
  });
});
