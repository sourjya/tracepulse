/**
 * Tests for the cross-layer pattern library.
 *
 * Verifies that all patterns have valid structure, unique IDs,
 * and cover the expected failure signatures.
 */

import { describe, it, expect } from "vitest";
import { PATTERNS } from "@/correlation/cross-layer/pattern-library.js";

describe("PATTERNS", () => {
  it("contains at least 7 initial patterns", () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(9);
  });

  it("all patterns have unique IDs", () => {
    const ids = PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all patterns have valid structure", () => {
    for (const p of PATTERNS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.requiredSignals.length).toBeGreaterThan(0);
      expect(p.baseConfidence).toBeGreaterThanOrEqual(0);
      expect(p.baseConfidence).toBeLessThanOrEqual(100);
      expect(p.diagnosisTemplate).toBeTruthy();
      expect(p.suggestedFix).toBeTruthy();
      expect(p.timeWindowMs).toBeGreaterThan(0);
    }
  });

  it("all required signals have valid layer values", () => {
    const validLayers = ["backend", "frontend", "build", "git", "process"];
    for (const p of PATTERNS) {
      for (const s of p.requiredSignals) {
        expect(validLayers).toContain(s.layer);
        expect(s.type).toBeTruthy();
      }
    }
  });

  it("includes backend-ok-frontend-error pattern", () => {
    const pattern = PATTERNS.find((p) => p.id === "backend-ok-frontend-error");
    expect(pattern).toBeDefined();
    expect(pattern!.requiredSignals.some((s) => s.layer === "backend")).toBe(true);
    expect(pattern!.requiredSignals.some((s) => s.layer === "frontend")).toBe(true);
  });

  it("includes stale-server pattern", () => {
    const pattern = PATTERNS.find((p) => p.id === "stale-server");
    expect(pattern).toBeDefined();
    expect(pattern!.requiredSignals.some((s) => s.layer === "git")).toBe(true);
    expect(pattern!.requiredSignals.some((s) => s.layer === "process")).toBe(true);
  });

  it("includes rate-limited pattern", () => {
    const pattern = PATTERNS.find((p) => p.id === "rate-limited");
    expect(pattern).toBeDefined();
  });

  it("includes repeated-error pattern", () => {
    const pattern = PATTERNS.find((p) => p.id === "repeated-error");
    expect(pattern).toBeDefined();
  });

  it("includes schema-validation pattern", () => {
    const pattern = PATTERNS.find((p) => p.id === "schema-validation");
    expect(pattern).toBeDefined();
  });

  it("includes silent-failure pattern", () => {
    const pattern = PATTERNS.find((p) => p.id === "silent-failure");
    expect(pattern).toBeDefined();
    expect(pattern!.confidenceFloor).toBe(95);
  });

  it("includes build-failed-silently pattern", () => {
    const pattern = PATTERNS.find((p) => p.id === "build-failed-silently");
    expect(pattern).toBeDefined();
    expect(pattern!.confidenceFloor).toBe(75);
  });
});
