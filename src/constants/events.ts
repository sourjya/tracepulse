/**
 * Domain constants for event classification.
 *
 * Defines the fixed vocabularies for event sources, log levels, and signal
 * strength tiers used throughout the TracePulse pipeline. These are the
 * canonical values - all runtime validation checks against these sets.
 *
 * @see Decision 7 in docs/ideas/feature-architecture-analysis.md for signal tier rationale
 */

// ──────────────────────────────────────────────
// Event Sources
// ──────────────────────────────────────────────

/**
 * Where a log line originated. Phase 1 uses server-stdout and server-stderr.
 * build-error and docker-log are reserved for Phase 2+ but defined here
 * so the type system is complete from the start.
 */
export const EVENT_SOURCES = [
  "server-stdout",
  "server-stderr",
  "build-error",
  "docker-log",
] as const;

export type EventSource = (typeof EVENT_SOURCES)[number];

// ──────────────────────────────────────────────
// Log Levels
// ──────────────────────────────────────────────

/**
 * Log severity levels ordered from most to least severe.
 * The ordering matters for minimum-level filtering in MCP tool queries.
 */
export const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Numeric severity for level comparison. Lower number = more severe.
 * Used by ring buffer queries to implement minimum-level filtering.
 */
export const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

// ──────────────────────────────────────────────
// Signal Strength Tiers
// ──────────────────────────────────────────────

/**
 * Signal strength tiers derived from signal_score. Agents use these for
 * progressive disclosure - high-signal errors get full attention,
 * low-signal events are background noise.
 */
export const SIGNAL_STRENGTHS = ["high", "medium", "low"] as const;

export type SignalStrength = (typeof SIGNAL_STRENGTHS)[number];

/**
 * Threshold boundaries for signal strength tiers.
 * high: score >= 50, medium: score 20-49, low: score < 20.
 */
export const SIGNAL_THRESHOLDS = {
  HIGH_MIN: 50,
  MEDIUM_MIN: 20,
} as const;
