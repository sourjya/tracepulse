/**
 * Signal scorer for RuntimeEvent prioritization.
 *
 * Computes an additive signal_score (0-100) from ScoringHints, log level,
 * and occurrence count, then derives a signal_strength tier. Agents use
 * signal_strength for progressive disclosure — high-signal errors get
 * immediate attention, low-signal events are background noise.
 *
 * Scoring factors are defined in constants/scoring.ts. Strength thresholds
 * are defined in constants/events.ts. This module contains no magic numbers.
 *
 * @see constants/scoring.ts for factor values and calibration rationale
 * @see constants/events.ts for SIGNAL_THRESHOLDS tier boundaries
 */

import type { ScoringHints } from "@/types/parsers.js";
import type { LogLevel, SignalStrength } from "@/types/events.js";
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
} from "@/constants/scoring.js";
import { SIGNAL_THRESHOLDS } from "@/constants/events.js";

/** Return type for scoreSignal — the computed score and derived tier. */
interface SignalResult {
  readonly signal_score: number;
  readonly signal_strength: SignalStrength;
}

/**
 * Compute signal_score and signal_strength for a runtime event.
 *
 * Scoring is additive: each matching condition in hints/level/occurrenceCount
 * adds or subtracts points. The result is clamped to [0, 100] and mapped to
 * a strength tier (high/medium/low).
 *
 * @param hints - Scoring signals extracted by the parser (stack trace, HTTP status, etc.)
 * @param level - Log severity of the event
 * @param occurrenceCount - How many times this fingerprint has been seen (1 = first time)
 * @returns signal_score clamped to [0, 100] and the derived signal_strength tier
 */
export function scoreSignal(
  hints: ScoringHints,
  level: LogLevel,
  occurrenceCount: number,
): SignalResult {
  let score = 0;

  // Severity-based factors
  if (hints.is_unhandled_exception) score += SCORE_UNHANDLED_EXCEPTION;
  if (hints.has_stack_trace) score += SCORE_STACK_TRACE_PRESENT;
  if (hints.is_user_code) score += SCORE_USER_CODE_LOCATION;

  // HTTP status factors
  if (hints.http_status !== undefined) {
    if (hints.http_status >= 500) score += SCORE_HTTP_5XX;
    else if (hints.http_status >= 400) score += SCORE_HTTP_4XX;
  }

  // Log level factors
  if (level === "error") score += SCORE_ERROR_LEVEL;
  else if (level === "warn") score += SCORE_WARN_LEVEL;

  // Occurrence factors
  if (occurrenceCount === 1) score += SCORE_FIRST_OCCURRENCE;
  if (occurrenceCount >= RECURRENCE_THRESHOLD) score += SCORE_RECURRENCE_PENALTY;

  // Clamp to valid range
  score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, score));

  // Derive strength tier from thresholds
  const signal_strength: SignalStrength =
    score >= SIGNAL_THRESHOLDS.HIGH_MIN
      ? "high"
      : score >= SIGNAL_THRESHOLDS.MEDIUM_MIN
        ? "medium"
        : "low";

  return { signal_score: score, signal_strength };
}
