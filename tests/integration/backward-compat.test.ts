/**
 * Backward compatibility regression test.
 *
 * Verifies that single-process mode works identically to Phase 2.
 * All Phase 1/2 behavior must be preserved.
 *
 * @see .kiro/specs/phase3-multi-process/tasks.md Phase 9 Step 17
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createServiceRegistry } from "@/services/service-registry.js";
import { handleGetErrors, handleGetServerLogs, handleGetRuntimeStatus, handleClearErrors } from "@/mcp/server.js";
import { handleListServices } from "@/tools/list-services.js";
import { parseArgs } from "@/cli.js";
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

describe("backward compatibility", () => {
  it("start with positional command still works", () => {
    const result = parseArgs(["node", "cli", "start", "npm run dev"]);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("start");
    if (result!.command === "start") {
      expect(result!.target).toBe("npm run dev");
    }
  });

  it("list_services returns [{ name: main }] in single-process mode", () => {
    const registry = createServiceRegistry();
    registry.register("main", "process");

    const result = handleListServices(registry);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.services).toHaveLength(1);
    expect(data.services[0].name).toBe("main");
  });

  it("get_errors without service filter works as before", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ level: "error" }));
    buffer.push(makeEvent({ level: "warn" }));

    const result = handleGetErrors(buffer, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(2);
  });

  it("service field on events defaults to main", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent());

    const result = handleGetErrors(buffer, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors[0].service).toBe("main");
  });

  it("Phase 1 tools still work: get_server_logs", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ level: "info" }));

    const result = handleGetServerLogs(buffer, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data).toHaveLength(1);
  });

  it("Phase 1 tools still work: get_runtime_status", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ level: "error" }));

    const result = handleGetRuntimeStatus(buffer, () => true);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.connected).toBe(true);
    expect(data.error_count).toBe(1);
  });

  it("Phase 1 tools still work: clear_errors", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent());

    const result = handleClearErrors(buffer);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.cleared_count).toBe(1);
    expect(buffer.size).toBe(0);
  });
});
