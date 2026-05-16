/**
 * Tests for clustered mode gateway proxy wiring.
 *
 * Verifies that:
 * - Flat mode (default) registers all 36 tools directly
 * - Clustered mode registers 7 gateways + 2 standalone = 9 visible tools
 * - Gateway discovery returns sub-tool listings
 * - Gateway dispatch routes to the correct sub-tool handler
 * - Destructive action guard blocks without confirm=true
 *
 * @see src/clusters/gateway.ts for gateway infrastructure
 * @see src/clusters/cluster-config.json for cluster definitions
 */

import { describe, it, expect } from "vitest";
import { createMcpServer } from "@/mcp/server.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { loadClusterConfig, createToolRegistry, createGatewayHandler } from "@/clusters/gateway.js";

/**
 * Helper to extract visible tool names from an McpServer instance.
 * Accesses the internal _registeredTools object (plain object, not Map).
 */
function getVisibleTools(server: ReturnType<typeof createMcpServer>): string[] {
  const internal = server as unknown as {
    _registeredTools: Record<string, { enabled: boolean }>;
  };
  return Object.entries(internal._registeredTools)
    .filter(([, t]) => t.enabled)
    .map(([name]) => name);
}

describe("Flat mode (default)", () => {
  it("registers all 36 tools", () => {
    const buffer = createRingBuffer();
    const server = createMcpServer(buffer, () => true);
    const tools = getVisibleTools(server);
    expect(tools.length).toBe(40);
    expect(tools).toContain("get_errors");
    expect(tools).toContain("run_and_watch");
    expect(tools).toContain("get_requests");
    expect(tools).toContain("verify_fix");
  });

  it("does not register any gateway tools", () => {
    const buffer = createRingBuffer();
    const server = createMcpServer(buffer, () => true);
    const tools = getVisibleTools(server);
    expect(tools).not.toContain("tp_health");
    expect(tools).not.toContain("tp_triage");
    expect(tools).not.toContain("tp_manage");
  });
});

describe("Clustered mode", () => {
  it("registers 9 visible tools (7 gateways + 2 standalone)", () => {
    const buffer = createRingBuffer();
    const server = createMcpServer(buffer, () => true, { clustered: true });
    const tools = getVisibleTools(server);
    // 7 gateways + run_and_watch + get_requests = 9, or 10 if free_port is standalone
    expect(tools.length).toBeGreaterThanOrEqual(9);
    expect(tools.length).toBeLessThanOrEqual(10);
  });

  it("includes all 7 gateway tools", () => {
    const buffer = createRingBuffer();
    const server = createMcpServer(buffer, () => true, { clustered: true });
    const tools = getVisibleTools(server);
    expect(tools).toContain("tp_health");
    expect(tools).toContain("tp_triage");
    expect(tools).toContain("tp_watch");
    expect(tools).toContain("tp_investigate");
    expect(tools).toContain("tp_correlate");
    expect(tools).toContain("tp_infra");
    expect(tools).toContain("tp_manage");
  });

  it("keeps standalone tools (run_and_watch, get_requests)", () => {
    const buffer = createRingBuffer();
    const server = createMcpServer(buffer, () => true, { clustered: true });
    const tools = getVisibleTools(server);
    expect(tools).toContain("run_and_watch");
    expect(tools).toContain("get_requests");
  });

  it("removes individual tools from MCP server", () => {
    const buffer = createRingBuffer();
    const server = createMcpServer(buffer, () => true, { clustered: true });
    const tools = getVisibleTools(server);
    // These should be behind gateways, not directly visible
    expect(tools).not.toContain("get_errors");
    expect(tools).not.toContain("verify_fix");
    expect(tools).not.toContain("get_project_health");
    expect(tools).not.toContain("clear_errors");
  });
});

describe("Gateway discovery", () => {
  it("returns sub-tool listing when called without action", () => {
    const config = loadClusterConfig();
    const registry = createToolRegistry();

    // Register a mock tool
    registry.register("get_errors", {
      description: "Get errors",
      inputSchema: {},
    }, () => ({ content: [{ type: "text" as const, text: "[]" }] }));

    const healthCluster = config.clusters.find(c => c.gateway === "tp_triage")!;
    const handler = createGatewayHandler(healthCluster, registry);
    const result = handler({});

    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.gateway).toBe("tp_triage");
    expect(parsed.available_tools).toBeInstanceOf(Array);
    expect(parsed.available_tools.some((t: { name: string }) => t.name === "get_errors")).toBe(true);
  });
});

describe("Gateway dispatch", () => {
  it("routes action to the correct sub-tool handler", async () => {
    const config = loadClusterConfig();
    const registry = createToolRegistry();

    registry.register("get_runtime_status", {
      description: "Health check",
      inputSchema: {},
    }, () => ({ content: [{ type: "text" as const, text: JSON.stringify({ connected: true }) }] }));

    const healthCluster = config.clusters.find(c => c.gateway === "tp_health")!;
    const handler = createGatewayHandler(healthCluster, registry);
    const result = await handler({ action: "get_runtime_status" });

    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(text)).toEqual({ connected: true });
  });

  it("returns error for unknown action", () => {
    const config = loadClusterConfig();
    const registry = createToolRegistry();

    const healthCluster = config.clusters.find(c => c.gateway === "tp_health")!;
    const handler = createGatewayHandler(healthCluster, registry);
    const result = handler({ action: "nonexistent_tool" });

    expect((result as { isError: boolean }).isError).toBe(true);
  });
});

describe("Destructive action guard", () => {
  it("blocks clear_errors without confirm=true", () => {
    const config = loadClusterConfig();
    const registry = createToolRegistry();

    registry.register("clear_errors", {
      description: "Clear errors",
      inputSchema: {},
    }, () => ({ content: [{ type: "text" as const, text: "cleared" }] }));

    const manageCluster = config.clusters.find(c => c.gateway === "tp_manage")!;
    const handler = createGatewayHandler(manageCluster, registry);
    const result = handler({ action: "clear_errors" });

    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain("destructive");
    expect(text).toContain("confirm=true");
  });

  it("allows clear_errors with confirm=true", () => {
    const config = loadClusterConfig();
    const registry = createToolRegistry();

    registry.register("clear_errors", {
      description: "Clear errors",
      inputSchema: {},
    }, () => ({ content: [{ type: "text" as const, text: "cleared" }] }));

    const manageCluster = config.clusters.find(c => c.gateway === "tp_manage")!;
    const handler = createGatewayHandler(manageCluster, registry);
    const result = handler({ action: "clear_errors", confirm: true });

    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toBe("cleared");
  });

  it("blocks restart_server without confirm=true", () => {
    const config = loadClusterConfig();
    const registry = createToolRegistry();

    registry.register("restart_server", {
      description: "Restart",
      inputSchema: {},
    }, () => ({ content: [{ type: "text" as const, text: "restarted" }] }));

    const manageCluster = config.clusters.find(c => c.gateway === "tp_manage")!;
    const handler = createGatewayHandler(manageCluster, registry);
    const result = handler({ action: "restart_server" });

    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain("destructive");
  });
});

describe("Cluster config integrity", () => {
  it("covers all 36 tools (clustered + standalone)", () => {
    const config = loadClusterConfig();
    const clustered = config.clusters.flatMap(c => [...c.tools]);
    const standalone = config.standalone ?? [];
    const total = clustered.length + standalone.length;
    expect(total).toBe(40);
  });

  it("has no duplicate tool assignments", () => {
    const config = loadClusterConfig();
    const all = [
      ...config.clusters.flatMap(c => [...c.tools]),
      ...(config.standalone ?? []),
    ];
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });
});
