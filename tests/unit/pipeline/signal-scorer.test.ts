/**
 * Unit tests for the signal scorer.
 *
 * Verifies that scoreSignal computes additive signal_score from ScoringHints,
 * LogLevel, and occurrence count, then derives the correct signal_strength tier.
 * All expected values reference named constants from constants/scoring.ts and
 * constants/events.ts to ensure tests break if scoring factors change.
 *
 * @see src/pipeline/signal-scorer.ts for implementation
 * @see src/constants/scoring.ts for scoring factor values
 */

import { describe, it, expect } from "vitest";
import { scoreSignal } from "@/pipeline/signal-scorer";
import type { ScoringHints } from "@/types/parsers";
import {
  SCORE_UNHANDLED_EXCEPTION,
  SCORE_STACK_TRACE_PRESENT,
  SCORE_USER_CODE_LOCATION,
  SCORE_HTTP_5XX,
  SCORE_HTTP_4XX,
  SCORE_ERROR_LEVEL,
  SCORE_WARN_LEVEL,
  SCORE_FIRST_OCCURRENCE,
  SCORE_RECURRENCE_PENALTY,
  RECURRENCE_THRESHOLD,
  SCORE_MIN,
  SCORE_MAX,
} from "@/constants/scoring";
import { SIGNAL_THRESHOLDS } from "@/constants/events";

describe("scoreSignal", () => {
  // ──────────────────────────────────────────────
  // Composite scenarios
  // ──────────────────────────────────────────────

  it("scores unhandled exception with user-code stack trace >= 75 (high)", () => {
    const hints: ScoringHints = {
      is_unhandled_exception: true,
      has_stack_trace: true,
      is_user_code: true,
    };
    const result = scoreSignal(hints, "error", 1);

    // 40 + 20 + 15 + 10 (error level) + 10 (first occurrence) = 95
    const expected =
      SCORE_UNHANDLED_EXCEPTION +
      SCORE_STACK_TRACE_PRESENT +
      SCORE_USER_CODE_LOCATION +
      SCORE_ERROR_LEVEL +
      SCORE_FIRST_OCCURRENCE;
    expect(result.signal_score).toBe(expected);
    expect(result.signal_score).toBeGreaterThanOrEqual(75);
    expect(result.signal_strength).toBe("high");
  });

  it("scores error-level log without stack trace between 10-30", () => {
    const hints: ScoringHints = {};
    const result = scoreSignal(hints, "error", 1);

    // 10 (error level) + 10 (first occurrence) = 20
    const expected = SCORE_ERROR_LEVEL + SCORE_FIRST_OCCURRENCE;
    expect(result.signal_score).toBe(expected);
    expect(result.signal_score).toBeGreaterThanOrEqual(10);
    expect(result.signal_score).toBeLessThanOrEqual(30);
  });

  it("scores warning-level log between 5-15 (low)", () => {
    const hints: ScoringHints = {};
    const result = scoreSignal(hints, "warn", 1);

    // 5 (warn level) + 10 (first occurrence) = 15
    const expected = SCORE_WARN_LEVEL + SCORE_FIRST_OCCURRENCE;
    expect(result.signal_score).toBe(expected);
    expect(result.signal_score).toBeGreaterThanOrEqual(5);
    expect(result.signal_score).toBeLessThanOrEqual(15);
    expect(result.signal_strength).toBe("low");
  });

  it("scores HTTP 5xx with stack trace as high", () => {
    const hints: ScoringHints = {
      has_stack_trace: true,
      http_status: 500,
    };
    const result = scoreSignal(hints, "error", 1);

    // 20 + 15 + 10 + 10 = 55
    const expected =
      SCORE_STACK_TRACE_PRESENT +
      SCORE_HTTP_5XX +
      SCORE_ERROR_LEVEL +
      SCORE_FIRST_OCCURRENCE;
    expect(result.signal_score).toBe(expected);
    expect(result.signal_score).toBeGreaterThanOrEqual(SIGNAL_THRESHOLDS.HIGH_MIN);
    expect(result.signal_strength).toBe("high");
  });

  // ──────────────────────────────────────────────
  // Individual scoring factors
  // ──────────────────────────────────────────────

  it("adds first occurrence bonus for occurrenceCount === 1", () => {
    const hints: ScoringHints = {};
    const first = scoreSignal(hints, "error", 1);
    const second = scoreSignal(hints, "error", 2);

    expect(first.signal_score - second.signal_score).toBe(SCORE_FIRST_OCCURRENCE);
  });

  it("applies recurrence penalty at 3+ occurrences", () => {
    const hints: ScoringHints = {};
    const belowThreshold = scoreSignal(hints, "error", RECURRENCE_THRESHOLD - 1);
    const atThreshold = scoreSignal(hints, "error", RECURRENCE_THRESHOLD);

    expect(atThreshold.signal_score - belowThreshold.signal_score).toBe(
      SCORE_RECURRENCE_PENALTY,
    );
  });

  it("applies HTTP 4xx scoring factor", () => {
    const without: ScoringHints = {};
    const with4xx: ScoringHints = { http_status: 404 };
    const a = scoreSignal(without, "error", 2);
    const b = scoreSignal(with4xx, "error", 2);

    expect(b.signal_score - a.signal_score).toBe(SCORE_HTTP_4XX);
  });

  // ──────────────────────────────────────────────
  // Clamping
  // ──────────────────────────────────────────────

  it("clamps score to [0, 100]", () => {
    // Max possible: all bonuses active
    const maxHints: ScoringHints = {
      is_unhandled_exception: true,
      has_stack_trace: true,
      is_user_code: true,
      http_status: 503,
      is_first_occurrence: true,
    };
    const high = scoreSignal(maxHints, "error", 1);
    expect(high.signal_score).toBeLessThanOrEqual(SCORE_MAX);
    expect(high.signal_score).toBeGreaterThanOrEqual(SCORE_MIN);

    // Min possible: no hints, debug level, high recurrence
    const low = scoreSignal({}, "debug", 100);
    expect(low.signal_score).toBeGreaterThanOrEqual(SCORE_MIN);
    expect(low.signal_score).toBeLessThanOrEqual(SCORE_MAX);
  });

  // ──────────────────────────────────────────────
  // Signal strength derivation
  // ──────────────────────────────────────────────

  it("derives high strength for score >= 50", () => {
    const hints: ScoringHints = {
      is_unhandled_exception: true,
      has_stack_trace: true,
    };
    const result = scoreSignal(hints, "error", 1);

    expect(result.signal_score).toBeGreaterThanOrEqual(SIGNAL_THRESHOLDS.HIGH_MIN);
    expect(result.signal_strength).toBe("high");
  });

  it("derives medium strength for score 20-49", () => {
    const hints: ScoringHints = { has_stack_trace: true };
    const result = scoreSignal(hints, "info", 2);

    // 20 (stack trace only, no level bonus, no first occurrence)
    expect(result.signal_score).toBeGreaterThanOrEqual(SIGNAL_THRESHOLDS.MEDIUM_MIN);
    expect(result.signal_score).toBeLessThan(SIGNAL_THRESHOLDS.HIGH_MIN);
    expect(result.signal_strength).toBe("medium");
  });

  it("derives low strength for score < 20", () => {
    const result = scoreSignal({}, "warn", 2);

    // 5 (warn level only)
    expect(result.signal_score).toBeLessThan(SIGNAL_THRESHOLDS.MEDIUM_MIN);
    expect(result.signal_strength).toBe("low");
  });

  // ──────────────────────────────────────────────
  // Edge cases
  // ──────────────────────────────────────────────

  it("scores 0 (low) for empty hints with debug level", () => {
    const result = scoreSignal({}, "debug", 2);

    expect(result.signal_score).toBe(0);
    expect(result.signal_strength).toBe("low");
  });
});
