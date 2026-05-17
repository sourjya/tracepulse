/**
 * Tests for cross-layer diagnosis output gating and proposed_fix behavior.
 *
 * Covers:
 * - 2-signal minimum enforcement (quiet agent principle)
 * - proposed_fix null when confidence < floor
 * - proposed_fix present when confidence >= floor
 * - minSignals override for unambiguous patterns
 * - Edge cases: empty signals, all layers missing, single-layer only
 */

import { describe, it, expect } from "vitest";
import { diagnose, matchPattern } from "@/correlation/cross-layer/correlation-matcher.js";
import { PATTERNS } from "@/correlation/cross-layer/pattern-library.js";
import type { LayerSignal, CrossLayerPattern } from "@/correlation/cross-layer/types.js";

describe("Output gating - 2-signal minimum", () => {
  it("filters out patterns that match with only 1 signal when minSignals defaults to 2", () => {
    const now = Date.now();
    // backend-ok-frontend-error requires 2 signals (backend + frontend)
    // but build-error-runtime also requires 2 (backend exception + git file-changed)
    // A single backend exception alone should NOT trigger build-error-runtime
    const signals: LayerSignal[] = [
      { layer: "backend", type: "exception", timestamp: now, detail: "err", metadata: {} },
    ];
    const result = diagnose(signals, PATTERNS);
    // No pattern should fire with just 1 backend exception (all multi-signal patterns need 2+)
    const buildError = result.find(d => d.pattern_id === "build-error-runtime");
    expect(buildError).toBeUndefined();
  });

  it("allows single-signal patterns with minSignals: 1 to fire", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-429", timestamp: now, detail: "429", metadata: { status: 429 } },
    ];
    const result = diagnose(signals, PATTERNS);
    const rateLimited = result.find(d => d.pattern_id === "rate-limited");
    expect(rateLimited).toBeDefined();
    expect(rateLimited!.confidence).toBeGreaterThanOrEqual(85);
  });

  it("allows 422 to fire with single signal (minSignals: 1)", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-422", timestamp: now, detail: "422", metadata: { status: 422 } },
    ];
    const result = diagnose(signals, PATTERNS);
    const schema = result.find(d => d.pattern_id === "schema-validation");
    expect(schema).toBeDefined();
  });

  it("allows 401 to fire with single signal (minSignals: 1)", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-401", timestamp: now, detail: "401", metadata: { status: 401 } },
    ];
    const result = diagnose(signals, PATTERNS);
    const auth = result.find(d => d.pattern_id === "auth-expired");
    expect(auth).toBeDefined();
  });

  it("allows repeated-error to fire with single signal (minSignals: 1)", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "repeated-error", timestamp: now, detail: "3x", metadata: { occurrence_count: 5, fingerprint: "fp" } },
    ];
    const result = diagnose(signals, PATTERNS);
    const repeated = result.find(d => d.pattern_id === "repeated-error");
    expect(repeated).toBeDefined();
  });
});

describe("proposed_fix gating", () => {
  it("proposed_fix is non-null for high-confidence patterns (rate-limited, 85%)", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-429", timestamp: now, detail: "429", metadata: {} },
    ];
    const result = diagnose(signals, PATTERNS);
    const diag = result.find(d => d.pattern_id === "rate-limited");
    expect(diag!.proposed_fix).toBeTruthy();
  });

  it("proposed_fix is null for silent-failure pattern (confidenceFloor: 95, base: 70)", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: now - 2000, detail: "200", metadata: { status: 200 } },
      { layer: "frontend", type: "http-failure", timestamp: now - 1000, detail: "fail", metadata: { statusCode: 500 } },
    ];
    const result = diagnose(signals, PATTERNS);
    const silent = result.find(d => d.pattern_id === "silent-failure");
    if (silent) {
      // Base confidence is 70, floor is 95 — proposed_fix should be null
      expect(silent.proposed_fix).toBeNull();
      // But suggested_fix should still be present for reference
      expect(silent.suggested_fix).toBeTruthy();
    }
  });

  it("proposed_fix equals suggested_fix when confidence >= floor", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-422", timestamp: now, detail: "422", metadata: {} },
    ];
    const result = diagnose(signals, PATTERNS);
    const diag = result.find(d => d.pattern_id === "schema-validation");
    expect(diag!.proposed_fix).toBe(diag!.suggested_fix);
  });

  it("custom pattern with high floor gates proposed_fix correctly", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "test-signal", timestamp: now, detail: "x", metadata: {} },
    ];
    const pattern: CrossLayerPattern = {
      id: "test-gated",
      name: "Test",
      description: "Test",
      requiredSignals: [{ layer: "backend", type: "test-signal" }],
      baseConfidence: 50,
      confidenceFloor: 80,
      diagnosisTemplate: "Diagnosis",
      suggestedFix: "Fix it",
      timeWindowMs: 5000,
      minSignals: 1,
    };
    const result = diagnose(signals, [pattern]);
    expect(result).toHaveLength(1);
    expect(result[0].proposed_fix).toBeNull(); // 50 < 80
    expect(result[0].suggested_fix).toBe("Fix it");
  });
});

describe("matchPattern edge cases", () => {
  it("returns false for empty signals array", () => {
    const pattern: CrossLayerPattern = {
      id: "test",
      name: "Test",
      description: "Test",
      requiredSignals: [{ layer: "backend", type: "http-500" }],
      baseConfidence: 70,
      diagnosisTemplate: "x",
      suggestedFix: "y",
      timeWindowMs: 5000,
    };
    expect(matchPattern([], pattern)).toBe(false);
  });

  it("returns false when signal type doesn't match exactly", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: now, detail: "ok", metadata: {} },
    ];
    const pattern: CrossLayerPattern = {
      id: "test",
      name: "Test",
      description: "Test",
      requiredSignals: [{ layer: "backend", type: "http-500" }],
      baseConfidence: 70,
      diagnosisTemplate: "x",
      suggestedFix: "y",
      timeWindowMs: 5000,
    };
    expect(matchPattern(signals, pattern)).toBe(false);
  });

  it("returns false when layer doesn't match", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "frontend", type: "http-500", timestamp: now, detail: "err", metadata: {} },
    ];
    const pattern: CrossLayerPattern = {
      id: "test",
      name: "Test",
      description: "Test",
      requiredSignals: [{ layer: "backend", type: "http-500" }],
      baseConfidence: 70,
      diagnosisTemplate: "x",
      suggestedFix: "y",
      timeWindowMs: 5000,
    };
    expect(matchPattern(signals, pattern)).toBe(false);
  });

  it("handles metadata match with nested values", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "frontend", type: "http-failure", timestamp: now, detail: "fail", metadata: { statusCode: 429 } },
    ];
    const pattern: CrossLayerPattern = {
      id: "test",
      name: "Test",
      description: "Test",
      requiredSignals: [{ layer: "frontend", type: "http-failure", metadataMatch: { statusCode: 429 } }],
      baseConfidence: 70,
      diagnosisTemplate: "x",
      suggestedFix: "y",
      timeWindowMs: 5000,
      minSignals: 1,
    };
    expect(matchPattern(signals, pattern)).toBe(true);
  });

  it("metadata match fails when value differs", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "frontend", type: "http-failure", timestamp: now, detail: "fail", metadata: { statusCode: 500 } },
    ];
    const pattern: CrossLayerPattern = {
      id: "test",
      name: "Test",
      description: "Test",
      requiredSignals: [{ layer: "frontend", type: "http-failure", metadataMatch: { statusCode: 429 } }],
      baseConfidence: 70,
      diagnosisTemplate: "x",
      suggestedFix: "y",
      timeWindowMs: 5000,
      minSignals: 1,
    };
    expect(matchPattern(signals, pattern)).toBe(false);
  });
});

describe("diagnose edge cases", () => {
  it("returns empty for empty signals", () => {
    expect(diagnose([], PATTERNS)).toEqual([]);
  });

  it("returns max 3 diagnoses even when many patterns match", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-429", timestamp: now - 4000, detail: "429", metadata: {} },
      { layer: "backend", type: "http-422", timestamp: now - 3000, detail: "422", metadata: {} },
      { layer: "backend", type: "http-401", timestamp: now - 2000, detail: "401", metadata: {} },
      { layer: "backend", type: "repeated-error", timestamp: now - 1000, detail: "3x", metadata: { occurrence_count: 5, fingerprint: "fp" } },
    ];
    const result = diagnose(signals, PATTERNS);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("diagnoses are sorted by confidence descending", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-429", timestamp: now - 2000, detail: "429", metadata: {} },
      { layer: "backend", type: "repeated-error", timestamp: now - 1000, detail: "3x", metadata: { occurrence_count: 3, fingerprint: "fp" } },
    ];
    const result = diagnose(signals, PATTERNS);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].confidence).toBeLessThanOrEqual(result[i - 1].confidence);
    }
  });

  it("each diagnosis includes layers_involved", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: now - 2000, detail: "ok", metadata: {} },
      { layer: "frontend", type: "type-error", timestamp: now - 1000, detail: "err", metadata: {} },
    ];
    const result = diagnose(signals, PATTERNS);
    for (const d of result) {
      expect(d.layers_involved.length).toBeGreaterThan(0);
    }
  });
});
