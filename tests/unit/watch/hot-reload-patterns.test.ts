/**
 * Unit tests for hot-reload pattern registry.
 *
 * Validates that each default pattern matches its expected dev tool output
 * and does NOT match unrelated log lines. Also verifies the pattern structure
 * (required fields: id, tool, pattern, description).
 *
 * @see src/watch/hot-reload-patterns.ts for the implementation
 * @see .kiro/specs/phase2-watch-mode/design.md for pattern specifications
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_PATTERNS,
  type HotReloadPattern,
} from "@/watch/hot-reload-patterns.js";

describe("hot-reload patterns", () => {
  it("exports a non-empty array of patterns", () => {
    expect(Array.isArray(DEFAULT_PATTERNS)).toBe(true);
    expect(DEFAULT_PATTERNS.length).toBeGreaterThan(0);
  });

  it("each pattern has required fields: id, tool, pattern, description", () => {
    for (const p of DEFAULT_PATTERNS) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.tool).toBe("string");
      expect(p.pattern).toBeInstanceOf(RegExp);
      expect(typeof p.description).toBe("string");
    }
  });

  it("each pattern has a unique id", () => {
    const ids = DEFAULT_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("vite-compiled matches Vite compilation output", () => {
    const p = find("vite-compiled");
    expect(p.pattern.test("✓ compiled successfully in 245ms")).toBe(true);
    expect(p.pattern.test("ready in 1200ms")).toBe(true);
  });

  it("vite-hmr matches Vite HMR update", () => {
    const p = find("vite-hmr");
    expect(p.pattern.test("[vite] hmr update /src/App.tsx")).toBe(true);
  });

  it("webpack-compiled matches webpack compilation", () => {
    const p = find("webpack-compiled");
    expect(p.pattern.test("Compiled successfully.")).toBe(true);
    expect(p.pattern.test("compiled with 2 warnings")).toBe(true);
  });

  it("nodemon-restart matches nodemon restart", () => {
    const p = find("nodemon-restart");
    expect(p.pattern.test("[nodemon] restarting due to changes...")).toBe(true);
  });

  it("nodemon-starting matches nodemon starting", () => {
    const p = find("nodemon-starting");
    expect(p.pattern.test("[nodemon] starting `node server.js`")).toBe(true);
  });

  it("nextjs-compiled matches Next.js compilation", () => {
    const p = find("nextjs-compiled");
    expect(p.pattern.test("✓ Ready in 1.2s")).toBe(true);
    expect(p.pattern.test("compiled client and server successfully")).toBe(true);
  });

  it("nextjs-compiling matches Next.js compiling route", () => {
    const p = find("nextjs-compiling");
    expect(p.pattern.test("Compiling /api/users...")).toBe(true);
  });

  it("tsnode-restart matches ts-node-dev restart", () => {
    const p = find("tsnode-restart");
    expect(p.pattern.test("[INFO] Restarting...")).toBe(true);
    expect(p.pattern.test("Compilation complete. Watching for file changes.")).toBe(true);
  });

  it("patterns do NOT match unrelated log lines", () => {
    const unrelated = [
      "Server listening on port 3000",
      "GET /api/users 200 15ms",
      "TypeError: Cannot read property 'id' of undefined",
      "npm warn deprecated package@1.0.0",
      "info: database connected",
    ];
    for (const line of unrelated) {
      for (const p of DEFAULT_PATTERNS) {
        expect(p.pattern.test(line)).toBe(false);
      }
    }
  });
});

/** Helper to find a pattern by id, throwing if not found. */
function find(id: string): HotReloadPattern {
  const p = DEFAULT_PATTERNS.find((p) => p.id === id);
  if (!p) throw new Error(`Pattern not found: ${id}`);
  return p;
}
