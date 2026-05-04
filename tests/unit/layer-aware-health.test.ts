/**
 * Tests for layer-aware get_project_health (M21).
 *
 * @see src/tools/get-project-health.ts
 */

import { describe, it, expect } from "vitest";
import { handleGetProjectHealth } from "@/tools/get-project-health.js";
import { createRingBuffer } from "@/store/ring-buffer.js";

describe("Layer-aware get_project_health (M21)", () => {
  it("includes layers status when server not connected", () => {
    const buffer = createRingBuffer();
    const result = handleGetProjectHealth(buffer, () => false, null);
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.layers).toBeDefined();
    expect(parsed.layers.filesystem).toBe(true);
    expect(parsed.layers.server).toBe(false);
  });

  it("includes layers status when server connected", () => {
    const buffer = createRingBuffer();
    const result = handleGetProjectHealth(buffer, () => true, null);
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.layers.server).toBe(true);
  });

  it("includes server suggestions when not connected", () => {
    const buffer = createRingBuffer();
    const result = handleGetProjectHealth(buffer, () => false, null, process.cwd());
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.server).toBeDefined();
    expect(parsed.server.status).toBe("not_started");
    // Suggestions should have confidence levels
    if (parsed.server.suggestions) {
      expect(parsed.server.suggestions[0].confidence).toBeDefined();
    }
  });

  it("shows running status when connected", () => {
    const buffer = createRingBuffer();
    const result = handleGetProjectHealth(buffer, () => true, null);
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.server.connected).toBe(true);
  });
});
