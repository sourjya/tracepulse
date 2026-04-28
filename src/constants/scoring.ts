/**
 * Signal scoring factors for RuntimeEvent prioritization.
 *
 * Scoring is additive: each matching condition adds (or subtracts) points.
 * The final score is clamped to [0, 100]. Signal strength tiers are derived
 * from the score using thresholds in events.ts.
 *
 * These factors are calibrated so that a clear crash with a user-code stack
 * trace scores ~85 (high), a vague warning scores ~5 (low), and everything
 * else falls in between. The goal is to help agents prioritize which errors
 * to investigate first.
 *
 * @see Decision 7 in docs/ideas/feature-architecture-analysis.md
 */

/** Points added when the error is an unhandled exception or process crash. */
export const SCORE_UNHANDLED_EXCEPTION = 40;

/** Points added when a stack trace is present in the error. */
export const SCORE_STACK_TRACE_PRESENT = 20;

/** Points added when file:line points to user code (not node_modules/stdlib). */
export const SCORE_USER_CODE_LOCATION = 15;

/** Points added for HTTP 5xx server errors. */
export const SCORE_HTTP_5XX = 15;

/** Points added for HTTP 4xx client errors. */
export const SCORE_HTTP_4XX = 10;

/** Points added for error-level log entries. */
export const SCORE_ERROR_LEVEL = 10;

/** Points added for warning-level log entries. */
export const SCORE_WARN_LEVEL = 5;

/** Points added for the first occurrence of a new fingerprint. */
export const SCORE_FIRST_OCCURRENCE = 10;

/** Points subtracted when an error has been seen 3+ times (noise reduction). */
export const SCORE_RECURRENCE_PENALTY = -5;

/** Threshold for recurrence penalty — applied at this many occurrences. */
export const RECURRENCE_THRESHOLD = 3;

/** Minimum possible signal score. */
export const SCORE_MIN = 0;

/** Maximum possible signal score. */
export const SCORE_MAX = 100;
