/**
 * Unit tests for list_services MCP tool handler.
 *
 * @see src/tools/list-services.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { createServiceRegistry } from "@/services/service-registry.js";
import { handleListServices } from "@/tools/list-services.js";

describe("list_services MCP tool", () => {
  it("returns all registered services with correct fields", () => {
    const reg = createServiceRegistry();
    reg.register("api", "process");
    reg.register("worker", "docker");

    const result = handleListServices(reg);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.services).toHaveLength(2);
    expect(data.services[0]).toHaveProperty("name");
    expect(data.services[0]).toHaveProperty("status");
    expect(data.services[0]).toHaveProperty("errorCount");
    expect(data.services[0]).toHaveProperty("lastActivity");
    expect(data.services[0]).toHaveProperty("sourceType");
  });

  it("single-process mode returns [{ name: main }]", () => {
    const reg = createServiceRegistry();
    reg.register("main", "process");

    const result = handleListServices(reg);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.services).toHaveLength(1);
    expect(data.services[0].name).toBe("main");
  });

  it("error_count reflects total errors", () => {
    const reg = createServiceRegistry();
    reg.register("api", "process");
    reg.recordEvent("api", Date.now());
    reg.recordEvent("api", Date.now());

    const result = handleListServices(reg);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.services[0].errorCount).toBe(2);
  });

  it("last_activity reflects most recent event timestamp", () => {
    const reg = createServiceRegistry();
    reg.register("api", "process");
    const ts = Date.now();
    reg.recordEvent("api", ts);

    const result = handleListServices(reg);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.services[0].lastActivity).toBe(ts);
  });

  it("service status values match registry state", () => {
    const reg = createServiceRegistry();
    reg.register("api", "process");
    reg.updateStatus("api", "crashed");

    const result = handleListServices(reg);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.services[0].status).toBe("crashed");
  });
});
