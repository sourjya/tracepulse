/**
 * Types for the error parser subsystem.
 *
 * Defines the ErrorParser interface (implemented by each framework parser),
 * ParsedError (intermediate representation between parsing and normalization),
 * and ScoringHints (signals for the signal scorer).
 *
 * @see Phase 1 design.md for parser registry design
 */

import type { LogLevel, EventContext } from "@/types/events.js";

// ──────────────────────────────────────────────
// Scoring Hints
// ──────────────────────────────────────────────

/**
 * Signals extracted by parsers that feed into the signal scorer.
 * Each hint maps to a scoring factor in constants/scoring.ts.
 */
export interface ScoringHints {
  /** True if the error is an unhandled exception or process crash. */
  readonly is_unhandled_exception?: boolean;
  /** True if a stack trace was found. */
  readonly has_stack_trace?: boolean;
  /** True if file:line points to user code (not node_modules/stdlib). */
  readonly is_user_code?: boolean;
  /** HTTP status code if the error is HTTP-related. */
  readonly http_status?: number;
  /** True if this fingerprint hasn't been seen before. Set by normalizer, not parser. */
  readonly is_first_occurrence?: boolean;
}

// ──────────────────────────────────────────────
// Parsed Error
// ──────────────────────────────────────────────

/**
 * Intermediate representation returned by error parsers.
 * The event normalizer converts this into a RuntimeEvent.
 * Parsers only extract what they can - all fields except message are optional.
 */
export interface ParsedError {
  /** The error message text. */
  readonly message: string;
  /** Full stack trace string. */
  readonly stack_trace?: string;
  /** Log level detected by the parser. */
  readonly level: LogLevel;
  /** Structured context extracted from the error. */
  readonly context: Partial<EventContext>;
  /** Scoring hints for the signal scorer. */
  readonly scoring_hints: ScoringHints;
}

// ──────────────────────────────────────────────
// Error Parser Interface
// ──────────────────────────────────────────────

/**
 * Interface for framework-specific error parsers.
 * Each parser attempts to match and extract structured data from raw log lines.
 * Parsers are tried in registration order; the first match wins.
 */
export interface ErrorParser {
  /** Human-readable name for logging (e.g., 'node', 'python'). */
  readonly name: string;

  /**
   * Test whether this parser can handle the given line(s).
   * Must be fast - called for every line against every parser until one matches.
   * Should not throw.
   */
  canParse(line: string): boolean;

  /**
   * Parse the line(s) into a ParsedError.
   * Called only if canParse returned true.
   * Returns null if parsing fails despite canParse returning true.
   */
  parse(line: string): ParsedError | null;
}
