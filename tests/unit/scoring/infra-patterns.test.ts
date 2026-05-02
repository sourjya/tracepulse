/**
 * Tests for infrastructure pattern scoring boost.
 *
 * Verifies that matchInfraPattern is actually wired into the
 * event normalizer pipeline - not just defined but unused.
 *
 * @see src/scoring/infra-patterns.ts for pattern definitions
 * @see src/pipeline/event-normalizer.ts for wiring
 */

import { describe, it, expect } from "vitest";
import { matchInfraPattern } from "@/scoring/infra-patterns.js";
import { normalizeEvent } from "@/pipeline/event-normalizer.js";
import type { ParsedError } from "@/types/parsers.js";

describe("Infrastructure Pattern Scoring", () => {
  it("matchInfraPattern detects connection refused", () => {
    const match = matchInfraPattern("Error: connect ECONNREFUSED 127.0.0.1:5432");
    expect(match).toBeDefined();
    expect(match!.category).toBe("connectivity");
    expect(match!.score_boost).toBeGreaterThan(0);
  });

  it("matchInfraPattern detects OOM", () => {
    const match = matchInfraPattern("FATAL ERROR: JavaScript heap out of memory");
    expect(match).toBeDefined();
    expect(match!.score_boost).toBeGreaterThanOrEqual(25);
  });

  it("matchInfraPattern returns undefined for non-infra errors", () => {
    const match = matchInfraPattern("TypeError: Cannot read properties of null");
    expect(match).toBeUndefined();
  });

  it("infra boost is applied in normalizeEvent", () => {
    const parsed: ParsedError = {
      message: "Error: connect ECONNREFUSED 127.0.0.1:5432",
      level: "error",
      context: {},
      scoring_hints: {},
    };

    const event = normalizeEvent(parsed, parsed.message, "server-stderr", false);

    // Base score for error level (~10) + infra boost (~20) = should be > 25
    expect(event.signal_score).toBeGreaterThan(25);
  });

  it("non-infra error does not get boost", () => {
    const parsed: ParsedError = {
      message: "TypeError: Cannot read properties of null",
      level: "error",
      context: {},
      scoring_hints: {},
    };

    const event = normalizeEvent(parsed, parsed.message, "server-stderr", false);

    // Base score for error level only (~10), no infra boost
    expect(event.signal_score).toBeLessThanOrEqual(20);
  });
});
