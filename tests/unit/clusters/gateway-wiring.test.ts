/**
 * Tests for M15 Phase 2: gateway wiring in clustered mode.
 *
 * @see .kiro/specs/m15-tool-schema-optimization/requirements.md
 */

import { describe, it, expect } from "vitest";
import {
  loadClusterConfig,
  createToolRegistry,
  createGatewayHandler,
} from "@/clusters/gateway.js";

describe("Gateway Wiring (M15 Phase 2)", () => {
  it("gateway discovery lists sub-tools", () => {
    const config = loadClusterConfig();
    const registry = createToolRegistry();

    // Register a fake tool
    registry.register("get_errors", { description: "Get errors", inputSchema: {} },
      () => ({ content: [{ type: "text" as const, text: '{"errors":[]}' }] }));

    const cluster = config.clusters.find((c) => c.gateway === "tp_triage")!;
    const handler = createGatewayHandler(cluster, registry);

    // Discovery mode (no action)
    const result = handler({});
    const data = JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
    expect(data.gateway).toBe("tp_triage");
    expect(data.available_tools.length).toBeGreaterThan(0);
  });

  it("gateway dispatches to sub-tool", () => {
    const config = loadClusterConfig();
    const registry = createToolRegistry();

    registry.register("get_errors", { description: "Get errors", inputSchema: {} },
      (args) => ({ content: [{ type: "text" as const, text: JSON.stringify({ called: true, limit: args.limit }) }] }));

    const cluster = config.clusters.find((c) => c.gateway === "tp_triage")!;
    const handler = createGatewayHandler(cluster, registry);

    const result = handler({ action: "get_errors", limit: 5 });
    const data = JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
    expect(data.called).toBe(true);
    expect(data.limit).toBe(5);
  });

  it("gateway rejects unknown action", () => {
    const config = loadClusterConfig();
    const registry = createToolRegistry();
    const cluster = config.clusters.find((c) => c.gateway === "tp_triage")!;
    const handler = createGatewayHandler(cluster, registry);

    const result = handler({ action: "nonexistent_tool" });
    expect((result as { isError?: boolean }).isError).toBe(true);
  });

  it("tp_manage requires confirm for destructive actions", () => {
    const config = loadClusterConfig();
    const registry = createToolRegistry();

    registry.register("clear_errors", { description: "Clear", inputSchema: {} },
      () => ({ content: [{ type: "text" as const, text: '{"cleared":true}' }] }));

    const cluster = config.clusters.find((c) => c.gateway === "tp_manage")!;
    const handler = createGatewayHandler(cluster, registry);

    // Without confirm
    const result1 = handler({ action: "clear_errors" });
    const text1 = (result1 as { content: Array<{ text: string }> }).content[0].text;
    expect(text1).toContain("destructive");

    // With confirm
    const result2 = handler({ action: "clear_errors", confirm: true });
    const data2 = JSON.parse((result2 as { content: Array<{ text: string }> }).content[0].text);
    expect(data2.cleared).toBe(true);
  });

  it("all 7 clusters have valid gateway names", () => {
    const config = loadClusterConfig();
    expect(config.clusters.length).toBe(7);
    const names = config.clusters.map((c) => c.gateway);
    expect(names).toContain("tp_health");
    expect(names).toContain("tp_triage");
    expect(names).toContain("tp_watch");
    expect(names).toContain("tp_investigate");
    expect(names).toContain("tp_correlate");
    expect(names).toContain("tp_infra");
    expect(names).toContain("tp_manage");
  });
});
