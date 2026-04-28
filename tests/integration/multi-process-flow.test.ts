/**
 * Integration test for multi-process flow.
 *
 * Verifies that the service registry, event buffer, and MCP tools
 * work together correctly in a multi-service scenario.
 * Uses direct buffer/registry manipulation instead of real process spawning
 * to avoid flaky timing issues.
 *
 * @see .kiro/specs/phase3-multi-process/tasks.md Phase 9 Step 16
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createServiceRegistry } from "@/services/service-registry.js";
import { handleGetErrors } from "@/mcp/server.js";
import { handleListServices } from "@/tools/list-services.js";
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

describe("multi-process integration", () => {
  it("list_services returns both services as running", () => {
    const registry = createServiceRegistry();
    registry.register("api", "process");
    registry.register("worker", "process");

    const result = handleListServices(registry);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.services).toHaveLength(2);
    expect(data.services.every((s: any) => s.status === "running")).toBe(true);
  });

  it("get_errors with service filter returns only that service's errors", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ service: "api", level: "error", message: "api error" }));
    buffer.push(makeEvent({ service: "worker", level: "error", message: "worker error" }));

    const result = handleGetErrors(buffer, { service: "api" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].service).toBe("api");
  });

  it("get_errors without service filter returns errors from both services", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ service: "api", level: "error" }));
    buffer.push(makeEvent({ service: "worker", level: "error" }));

    const result = handleGetErrors(buffer, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(2);
  });

  it("cross-service errors within correlation window get grouped", () => {
    const buffer = createRingBuffer(100);
    const base = Date.now();
    buffer.push(makeEvent({ service: "api", level: "error", timestamp: base }));
    buffer.push(makeEvent({ service: "worker", level: "error", timestamp: base + 500 }));

    const result = handleGetErrors(buffer, {});
    const data = JSON.parse(result.content[0].text as string);
    const withGroup = data.errors.filter((e: any) => e.correlation_group);
    expect(withGroup).toHaveLength(2);
  });

  it("service registry tracks error counts correctly", () => {
    const registry = createServiceRegistry();
    registry.register("api", "process");
    registry.recordEvent("api", Date.now());
    registry.recordEvent("api", Date.now());

    const result = handleListServices(registry);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.services[0].errorCount).toBe(2);
  });
});
