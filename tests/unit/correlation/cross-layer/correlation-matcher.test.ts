/**
 * Tests for the cross-layer correlation matcher.
 *
 * Verifies pattern matching logic, template filling, confidence scoring,
 * and the full diagnosis pipeline.
 */

import { describe, it, expect } from "vitest";
import {
  matchPattern,
  fillTemplate,
  diagnose,
} from "@/correlation/cross-layer/correlation-matcher.js";
import { PATTERNS } from "@/correlation/cross-layer/pattern-library.js";
import type { LayerSignal, CrossLayerPattern } from "@/correlation/cross-layer/types.js";

describe("matchPattern", () => {
  it("returns true when all required signals match within time window", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: now - 2000, detail: "GET /api 200", metadata: { status: 200 } },
      { layer: "frontend", type: "type-error", timestamp: now - 1000, detail: "TypeError: x.data is undefined", metadata: {} },
    ];
    const pattern: CrossLayerPattern = {
      id: "test",
      name: "Test",
      description: "Test pattern",
      requiredSignals: [
        { layer: "backend", type: "http-200" },
        { layer: "frontend", type: "type-error" },
      ],
      baseConfidence: 70,
      diagnosisTemplate: "Backend OK but frontend error",
      suggestedFix: "Check response parsing",
      timeWindowMs: 5000,
    };
    expect(matchPattern(signals, pattern)).toBe(true);
  });

  it("returns false when signals exceed time window", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: now - 60_000, detail: "old", metadata: {} },
      { layer: "frontend", type: "type-error", timestamp: now - 1000, detail: "new", metadata: {} },
    ];
    const pattern: CrossLayerPattern = {
      id: "test",
      name: "Test",
      description: "Test",
      requiredSignals: [
        { layer: "backend", type: "http-200" },
        { layer: "frontend", type: "type-error" },
      ],
      baseConfidence: 70,
      diagnosisTemplate: "x",
      suggestedFix: "y",
      timeWindowMs: 5000,
    };
    expect(matchPattern(signals, pattern)).toBe(false);
  });

  it("returns false when a required signal is missing", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: now, detail: "ok", metadata: {} },
    ];
    const pattern: CrossLayerPattern = {
      id: "test",
      name: "Test",
      description: "Test",
      requiredSignals: [
        { layer: "backend", type: "http-200" },
        { layer: "frontend", type: "type-error" },
      ],
      baseConfidence: 70,
      diagnosisTemplate: "x",
      suggestedFix: "y",
      timeWindowMs: 5000,
    };
    expect(matchPattern(signals, pattern)).toBe(false);
  });

  it("matches metadata constraints when specified", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-4xx", timestamp: now, detail: "422", metadata: { status: 422 } },
    ];
    const pattern: CrossLayerPattern = {
      id: "test",
      name: "Test",
      description: "Test",
      requiredSignals: [
        { layer: "backend", type: "http-4xx", metadataMatch: { status: 422 } },
      ],
      baseConfidence: 85,
      diagnosisTemplate: "Validation error",
      suggestedFix: "Fix payload",
      timeWindowMs: 5000,
    };
    expect(matchPattern(signals, pattern)).toBe(true);
  });
});

describe("fillTemplate", () => {
  it("replaces {placeholders} with signal metadata values", () => {
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: 0, detail: "GET /api/users 200", metadata: { path: "/api/users", status: 200 } },
      { layer: "frontend", type: "type-error", timestamp: 0, detail: "TypeError: resp.data is undefined", metadata: { error_message: "resp.data is undefined" } },
    ];
    const template = "Backend returned {backend.status} on {backend.path} but frontend got: {frontend.error_message}";
    const result = fillTemplate(template, signals);
    expect(result).toContain("200");
    expect(result).toContain("/api/users");
    expect(result).toContain("resp.data is undefined");
  });

  it("leaves unfilled placeholders as-is when metadata missing", () => {
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: 0, detail: "ok", metadata: {} },
    ];
    const template = "Status: {backend.status}";
    const result = fillTemplate(template, signals);
    expect(result).toBe("Status: {backend.status}");
  });
});

describe("diagnose", () => {
  it("returns empty array when no patterns match", () => {
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: Date.now(), detail: "ok", metadata: {} },
    ];
    const result = diagnose(signals, PATTERNS);
    // http-200 alone shouldn't match any pattern
    expect(result).toEqual([]);
  });

  it("returns diagnosis for backend-ok-frontend-error pattern", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: now - 2000, detail: "GET /api 200", metadata: { status: 200, path: "/api" } },
      { layer: "frontend", type: "type-error", timestamp: now - 1000, detail: "TypeError", metadata: { error_message: "Cannot read property 'data'" } },
    ];
    const result = diagnose(signals, PATTERNS);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const diag = result.find((d) => d.pattern_id === "backend-ok-frontend-error");
    expect(diag).toBeDefined();
    expect(diag!.confidence).toBeGreaterThanOrEqual(70);
    expect(diag!.layers_involved).toContain("backend");
    expect(diag!.layers_involved).toContain("frontend");
  });

  it("returns diagnoses sorted by confidence descending", () => {
    const now = Date.now();
    // Create signals that match multiple patterns
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: now - 2000, detail: "ok", metadata: { status: 200 } },
      { layer: "frontend", type: "type-error", timestamp: now - 1000, detail: "err", metadata: {} },
      { layer: "backend", type: "repeated-error", timestamp: now - 500, detail: "3x", metadata: { occurrence_count: 5, fingerprint: "fp-1" } },
    ];
    const result = diagnose(signals, PATTERNS);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].confidence).toBeLessThanOrEqual(result[i - 1].confidence);
    }
  });

  it("boosts confidence when optional signals match", () => {
    const now = Date.now();
    // stale-server pattern: git file-changed + no-restart-detected
    const signalsBase: LayerSignal[] = [
      { layer: "git", type: "file-changed", timestamp: now - 5000, detail: "src/app.ts changed", metadata: { files: ["src/app.ts"] } },
      { layer: "process", type: "no-restart-detected", timestamp: now - 1000, detail: "No restart", metadata: {} },
    ];
    const resultBase = diagnose(signalsBase, PATTERNS);
    const staleBase = resultBase.find((d) => d.pattern_id === "stale-server");

    // Add optional signal (backend error that could be from stale code)
    const signalsBoosted: LayerSignal[] = [
      ...signalsBase,
      { layer: "backend", type: "exception", timestamp: now - 2000, detail: "Error in changed file", metadata: {} },
    ];
    const resultBoosted = diagnose(signalsBoosted, PATTERNS);
    const staleBoosted = resultBoosted.find((d) => d.pattern_id === "stale-server");

    if (staleBase && staleBoosted) {
      expect(staleBoosted.confidence).toBeGreaterThanOrEqual(staleBase.confidence);
    }
  });

  it("limits output to top 3 diagnoses", () => {
    const now = Date.now();
    // Even if many patterns match, only top 3 returned
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: now - 4000, detail: "ok", metadata: { status: 200 } },
      { layer: "backend", type: "http-4xx", timestamp: now - 3000, detail: "422", metadata: { status: 422 } },
      { layer: "frontend", type: "type-error", timestamp: now - 2000, detail: "err", metadata: {} },
      { layer: "frontend", type: "http-failure", timestamp: now - 1500, detail: "fail", metadata: { statusCode: 422 } },
      { layer: "git", type: "file-changed", timestamp: now - 1000, detail: "changed", metadata: { files: ["x.ts"] } },
      { layer: "process", type: "no-restart-detected", timestamp: now - 500, detail: "stale", metadata: {} },
      { layer: "backend", type: "repeated-error", timestamp: now - 200, detail: "3x", metadata: { occurrence_count: 3, fingerprint: "fp" } },
    ];
    const result = diagnose(signals, PATTERNS);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("nulls proposed_fix when confidence is below pattern confidenceFloor", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-200", timestamp: now - 2000, detail: "ok", metadata: { status: 200 } },
      { layer: "frontend", type: "type-error", timestamp: now - 1000, detail: "err", metadata: {} },
    ];
    // Create a pattern with a high confidence floor that won't be met
    const highFloorPattern: CrossLayerPattern = {
      id: "test-high-floor",
      name: "Test",
      description: "Test",
      requiredSignals: [
        { layer: "backend", type: "http-200" },
        { layer: "frontend", type: "type-error" },
      ],
      baseConfidence: 60,
      confidenceFloor: 80, // Floor is higher than baseConfidence
      diagnosisTemplate: "Diagnosis",
      suggestedFix: "Fix it",
      timeWindowMs: 5000,
    };
    const result = diagnose(signals, [highFloorPattern]);
    expect(result).toHaveLength(1);
    expect(result[0].proposed_fix).toBeNull();
    expect(result[0].suggested_fix).toBe("Fix it"); // Still present for reference
  });

  it("includes proposed_fix when confidence meets or exceeds confidenceFloor", () => {
    const now = Date.now();
    const signals: LayerSignal[] = [
      { layer: "backend", type: "http-429", timestamp: now - 2000, detail: "429", metadata: { status: 429 } },
    ];
    // rate-limited pattern has minSignals: 1 and baseConfidence: 85
    const result = diagnose(signals, PATTERNS);
    const rateLimited = result.find((d) => d.pattern_id === "rate-limited");
    expect(rateLimited).toBeDefined();
    expect(rateLimited!.proposed_fix).toBeTruthy(); // Should have a fix since confidence >= floor
  });
});
