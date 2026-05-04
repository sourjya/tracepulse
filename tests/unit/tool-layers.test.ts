/**
 * Tests for dynamic tool activation based on capability layers.
 *
 * Layer 2 tools (get_errors, verify_fix, etc.) should be disabled
 * until a server is running. They return helpful messages when called
 * while disabled.
 *
 * @see src/mcp/tool-layers.ts
 */

import { describe, it, expect } from "vitest";
import { LAYER_2_TOOLS, getLayerHint } from "@/mcp/tool-layers.js";

describe("Tool layers", () => {
  it("LAYER_2_TOOLS contains server-dependent tools", () => {
    expect(LAYER_2_TOOLS).toContain("get_errors");
    expect(LAYER_2_TOOLS).toContain("verify_fix");
    expect(LAYER_2_TOOLS).toContain("watch_for_errors");
    expect(LAYER_2_TOOLS).toContain("get_server_logs");
  });

  it("LAYER_2_TOOLS does not contain Layer 0 tools", () => {
    expect(LAYER_2_TOOLS).not.toContain("run_and_watch");
    expect(LAYER_2_TOOLS).not.toContain("check_port");
    expect(LAYER_2_TOOLS).not.toContain("check_drift");
    expect(LAYER_2_TOOLS).not.toContain("get_project_health");
  });

  it("getLayerHint returns helpful message for Layer 2 tools", () => {
    const hint = getLayerHint("get_errors");
    expect(hint).toContain("start_server");
  });

  it("getLayerHint returns null for Layer 0 tools", () => {
    const hint = getLayerHint("run_and_watch");
    expect(hint).toBeNull();
  });
});
