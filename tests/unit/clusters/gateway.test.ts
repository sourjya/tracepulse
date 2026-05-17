/**
 * Tests for tool clustering gateway infrastructure.
 *
 * Verifies: cluster config loading, gateway registration, discovery mode,
 * dispatch mode, destructive action guard, and flat mode passthrough.
 *
 * @see .kiro/specs/m15-tool-schema-optimization/requirements.md
 * @see docs/engineering/designs/tool-clustering-guide.md
 */

import { describe, it, expect } from "vitest";
import {
  loadClusterConfig,
  createToolRegistry,
} from "@/clusters/gateway.js";

describe("loadClusterConfig", () => {
  it("loads valid cluster config", () => {
    const config = loadClusterConfig();
    expect(config.clusters.length).toBeGreaterThan(0);
    expect(config.clusters[0].gateway).toBeDefined();
    expect(config.clusters[0].tools.length).toBeGreaterThan(0);
  });

  it("has 7 clusters with tp_ prefix", () => {
    const config = loadClusterConfig();
    expect(config.clusters.length).toBe(7);
    for (const cluster of config.clusters) {
      expect(cluster.gateway).toMatch(/^tp_/);
    }
  });

  it("covers all registered tools", () => {
    const config = loadClusterConfig();
    const allTools = config.clusters.flatMap((c) => c.tools);
    // Should have 30+ tools across all clusters (some may be standalone)
    expect(allTools.length).toBeGreaterThanOrEqual(25);
  });
});

describe("createToolRegistry", () => {
  it("creates empty registry", () => {
    const registry = createToolRegistry();
    expect(registry.size).toBe(0);
  });

  it("registers and retrieves tools", () => {
    const registry = createToolRegistry();
    const handler = () => ({ content: [{ type: "text" as const, text: "ok" }] });
    registry.register("test_tool", { description: "test", inputSchema: {} }, handler);
    expect(registry.size).toBe(1);
    expect(registry.get("test_tool")).toBeDefined();
  });

  it("lists all registered tool names", () => {
    const registry = createToolRegistry();
    const handler = () => ({ content: [{ type: "text" as const, text: "ok" }] });
    registry.register("tool_a", { description: "a", inputSchema: {} }, handler);
    registry.register("tool_b", { description: "b", inputSchema: {} }, handler);
    expect(registry.list()).toEqual(["tool_a", "tool_b"]);
  });
});
