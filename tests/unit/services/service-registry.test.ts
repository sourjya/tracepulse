/**
 * Unit tests for ServiceRegistry.
 *
 * Tests service registration, status transitions, event recording,
 * and query methods.
 *
 * @see src/services/service-registry.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { createServiceRegistry } from "@/services/service-registry.js";

describe("ServiceRegistry", () => {
  it("register adds a service with status running", () => {
    const reg = createServiceRegistry();
    reg.register("api", "process");
    const svc = reg.getService("api");
    expect(svc).toBeDefined();
    expect(svc!.status).toBe("running");
    expect(svc!.sourceType).toBe("process");
  });

  it("register with duplicate name throws", () => {
    const reg = createServiceRegistry();
    reg.register("api", "process");
    expect(() => reg.register("api", "process")).toThrow();
  });

  it("updateStatus transitions state correctly", () => {
    const reg = createServiceRegistry();
    reg.register("api", "process");
    reg.updateStatus("api", "crashed");
    expect(reg.getService("api")!.status).toBe("crashed");
  });

  it("updateStatus with unknown service name throws", () => {
    const reg = createServiceRegistry();
    expect(() => reg.updateStatus("unknown", "stopped")).toThrow();
  });

  it("recordEvent increments errorCount and updates lastActivity", () => {
    const reg = createServiceRegistry();
    reg.register("api", "process");
    const before = reg.getService("api")!;
    expect(before.errorCount).toBe(0);
    expect(before.lastActivity).toBe(0);

    reg.recordEvent("api", Date.now());
    const after = reg.getService("api")!;
    expect(after.errorCount).toBe(1);
    expect(after.lastActivity).toBeGreaterThan(0);
  });

  it("getServices returns all registered services", () => {
    const reg = createServiceRegistry();
    reg.register("api", "process");
    reg.register("worker", "process");
    const all = reg.getServices();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.name).sort()).toEqual(["api", "worker"]);
  });

  it("getService returns undefined for unknown name", () => {
    const reg = createServiceRegistry();
    expect(reg.getService("nope")).toBeUndefined();
  });

  it("initial state: errorCount is 0, lastActivity is 0", () => {
    const reg = createServiceRegistry();
    reg.register("api", "process");
    const svc = reg.getService("api")!;
    expect(svc.errorCount).toBe(0);
    expect(svc.lastActivity).toBe(0);
  });

  it("single-process mode: registry has one entry with name main", () => {
    const reg = createServiceRegistry();
    reg.register("main", "process");
    expect(reg.getServices()).toHaveLength(1);
    expect(reg.getService("main")).toBeDefined();
  });
});
