/**
 * Event normalizer - converts ParsedErrors into RuntimeEvents.
 *
 * This is the final pipeline stage before events enter the ring buffer.
 * It takes parser output (ParsedError) or raw unmatched lines and produces
 * fully-populated RuntimeEvents with UUIDs, fingerprints, signal scores,
 * and truncated fields that respect the token-budget limits.
 *
 * Flow: Parser → **Normalizer** → Ring Buffer → MCP Tools
 *
 * @see src/types/events.ts for RuntimeEvent schema
 * @see src/types/parsers.ts for ParsedError input shape
 * @see src/constants/limits.ts for truncation thresholds
 */

import { randomUUID } from "node:crypto";
import type { RuntimeEvent, EventSource } from "@/types/events.js";
import type { ParsedError } from "@/types/parsers.js";
import {
  MAX_MESSAGE_LENGTH,
  MAX_STACK_FRAMES,
  MAX_RAW_LINE_LENGTH,
  TRUNCATION_SUFFIX,
} from "@/constants/limits.js";
import { fingerprint } from "@/pipeline/fingerprinter.js";
import { scoreSignal } from "@/pipeline/signal-scorer.js";
import { matchInfraPattern } from "@/scoring/infra-patterns.js";

// ──────────────────────────────────────────────
// Truncation Helpers
// ──────────────────────────────────────────────

/**
 * Truncate a string to maxLength, appending TRUNCATION_SUFFIX if cut.
 * Returns the original string unchanged if it fits within the limit.
 *
 * @param value     - String to truncate
 * @param maxLength - Maximum allowed length including suffix
 * @returns Truncated string with suffix, or original if within limit
 */
function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

/**
 * Truncate a stack trace to MAX_STACK_FRAMES lines.
 * Splits by newline, keeps the first N frames, and rejoins.
 *
 * @param stackTrace - Newline-delimited stack trace string
 * @returns Stack trace limited to MAX_STACK_FRAMES frames
 */
function truncateStackTrace(stackTrace: string): string {
  const frames = stackTrace.split("\n");
  if (frames.length <= MAX_STACK_FRAMES) return stackTrace;
  return frames.slice(0, MAX_STACK_FRAMES).join("\n");
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Convert a ParsedError into a fully-populated RuntimeEvent.
 *
 * Generates a UUID, computes fingerprint and signal score, applies
 * truncation limits, and sets default metadata (service, occurrence_count).
 *
 * @param parsed            - Structured error from a parser
 * @param raw               - Original raw log line(s)
 * @param source            - Where the log line originated
 * @param isFirstOccurrence - Whether this fingerprint is new (affects scoring)
 * @returns Complete RuntimeEvent ready for the ring buffer
 */
export function normalizeEvent(
  parsed: ParsedError,
  raw: string,
  source: EventSource,
  isFirstOccurrence: boolean,
): RuntimeEvent {
  const timestamp = Date.now();

  const hints = { ...parsed.scoring_hints, is_first_occurrence: isFirstOccurrence };
  const { signal_score: baseScore, signal_strength } = scoreSignal(hints, parsed.level, 1);

  // Apply infrastructure pattern boost (connection refused, OOM, pool exhausted, etc.)
  const infraMatch = matchInfraPattern(parsed.message);
  const signal_score = Math.min(100, baseScore + (infraMatch?.score_boost ?? 0));

  return {
    id: randomUUID(),
    timestamp,
    source,
    service: "main",
    level: parsed.level,
    message: truncateString(parsed.message, MAX_MESSAGE_LENGTH),
    stack_trace: parsed.stack_trace ? truncateStackTrace(parsed.stack_trace) : undefined,
    fingerprint: fingerprint(source, parsed.message, parsed.context.file, parsed.context.line),
    signal_score,
    signal_strength,
    context: parsed.context,
    raw: truncateString(raw, MAX_RAW_LINE_LENGTH),
    first_seen: timestamp,
    occurrence_count: 1,
  };
}

/**
 * Create a default info-level RuntimeEvent for a raw line no parser matched.
 *
 * Used when every registered parser's canParse() returns false. Produces a
 * low-signal event with no stack trace and empty scoring hints.
 *
 * @param line   - Raw log line that no parser could handle
 * @param source - Where the log line originated
 * @returns RuntimeEvent with level 'info' and minimal scoring
 */
export function normalizeRawLine(line: string, source: EventSource): RuntimeEvent {
  const parsed: ParsedError = {
    message: line,
    level: "info",
    context: {},
    scoring_hints: { is_first_occurrence: true },
  };
  return normalizeEvent(parsed, line, source, true);
}
