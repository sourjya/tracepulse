/**
 * Tests for MCP resource registration (skill discovery).
 *
 * TracePulse exposes skills as MCP resources so any client can
 * read them programmatically at session start.
 *
 * @see src/mcp/register-resources.ts
 */

import { describe, it, expect } from "vitest";
import { getSkillResources } from "@/mcp/register-resources.js";

describe("Skill resources", () => {
  it("returns at least 2 skill resources", () => {
    const resources = getSkillResources();
    expect(resources.length).toBeGreaterThanOrEqual(2);
  });

  it("each resource has uri, name, and content", () => {
    const resources = getSkillResources();
    for (const r of resources) {
      expect(r.uri).toMatch(/^tracepulse:\/\/skills\//);
      expect(r.name).toBeDefined();
      expect(r.content.length).toBeGreaterThan(0);
    }
  });

  it("includes the main tracepulse skill", () => {
    const resources = getSkillResources();
    expect(resources.some(r => r.name === "tracepulse")).toBe(true);
  });

  it("includes claude-rules skill", () => {
    const resources = getSkillResources();
    expect(resources.some(r => r.name === "claude-rules")).toBe(true);
  });
});
