/**
 * Unit tests for MultiProcessCollector.
 *
 * Tests spawning multiple services, tagging lines with service names,
 * handling process exit/crash, and graceful shutdown.
 *
 * @see src/collectors/multi-process-collector.ts for the implementation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createMultiProcessCollector } from "@/collectors/multi-process-collector.js";
import { createServiceRegistry } from "@/services/service-registry.js";
import type { EventSource } from "@/constants/events.js";

describe("MultiProcessCollector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawning a single service registers it in the ServiceRegistry", async () => {
    const registry = createServiceRegistry();
    const collector = createMultiProcessCollector(
      [{ name: "api", command: "echo hello" }],
      registry,
    );

    const lines: Array<{ service: string; source: EventSource; line: string }> = [];
    await collector.start((source, line, service) => {
      lines.push({ service, source, line });
    });

    // Wait for process to finish
    await new Promise((r) => setTimeout(r, 1500));

    expect(registry.getService("api")).toBeDefined();
    expect(registry.getService("api")!.sourceType).toBe("process");
  });

  it("spawning multiple services registers all in the ServiceRegistry", async () => {
    const registry = createServiceRegistry();
    const collector = createMultiProcessCollector(
      [
        { name: "svc-a", command: "echo a" },
        { name: "svc-b", command: "echo b" },
      ],
      registry,
    );

    await collector.start(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    expect(registry.getService("svc-a")).toBeDefined();
    expect(registry.getService("svc-b")).toBeDefined();
  });

  it("stdout lines from a service are tagged with the correct service name", async () => {
    const registry = createServiceRegistry();
    const collector = createMultiProcessCollector(
      [{ name: "echo-svc", command: "echo tagged-output" }],
      registry,
    );

    const lines: Array<{ service: string; source: EventSource; line: string }> = [];
    await collector.start((source, line, service) => {
      lines.push({ service, source, line });
    });

    await new Promise((r) => setTimeout(r, 1500));

    const tagged = lines.find((l) => l.line.includes("tagged-output"));
    expect(tagged).toBeDefined();
    expect(tagged!.service).toBe("echo-svc");
    expect(tagged!.source).toBe("server-stdout");
  });

  it("child process exit with code 0 sets service status to stopped", async () => {
    const registry = createServiceRegistry();
    const collector = createMultiProcessCollector(
      [{ name: "clean-exit", command: "echo done" }],
      registry,
    );

    await collector.start(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    expect(registry.getService("clean-exit")!.status).toBe("stopped");
  });

  it("child process exit with non-zero code sets service status to crashed", async () => {
    const registry = createServiceRegistry();
    const collector = createMultiProcessCollector(
      [{ name: "crash-svc", command: "node -e \"process.exit(1)\"" }],
      registry,
    );

    await collector.start(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    expect(registry.getService("crash-svc")!.status).toBe("crashed");
  });

  it("shutdown sends SIGTERM to all child processes", async () => {
    const registry = createServiceRegistry();
    const collector = createMultiProcessCollector(
      [{ name: "long-svc", command: "sleep 60" }],
      registry,
    );

    await collector.start(() => {});
    // Give process time to start
    await new Promise((r) => setTimeout(r, 500));

    expect(collector.isConnected()).toBe(true);
    await collector.stop();
    expect(registry.getService("long-svc")!.status).not.toBe("running");
  });
});
