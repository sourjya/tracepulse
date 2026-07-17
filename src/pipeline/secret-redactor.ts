/**
 * Secret redactor - first stage of the TracePulse pipeline.
 *
 * Every raw log line passes through redact() before entering the parser
 * or storage layers. This ensures no secrets appear in MCP responses,
 * the ring buffer, or diagnostic stderr logs.
 *
 * Patterns are compiled once at module load from constants/redaction.ts.
 * The redact function is a pure function with no side effects.
 *
 * @see src/constants/redaction.ts for pattern definitions
 */

import {
  REDACTION_PATTERNS,
  REDACTION_REPLACEMENT,
} from "@/constants/redaction.js";

/**
 * Pre-compiled patterns with fresh RegExp instances per call.
 * We store the source/flags and create new RegExp each call because
 * global regexes have mutable lastIndex state that causes bugs
 * when reused across calls.
 */
const COMPILED_PATTERNS = REDACTION_PATTERNS.map(
  ([name, pattern]) =>
    [name, pattern.source, pattern.flags] as const,
);

/**
 * Redact secrets from a raw log line.
 *
 * Applies all redaction patterns in order, replacing matches with [REDACTED].
 * Pure function - no side effects, no state mutation.
 *
 * @param line - Raw log line to redact
 * @returns The line with all detected secrets replaced
 */
export function redact(line: string): string {
  if (!line) return line;

  let result = line;
  for (const [_name, source, flags] of COMPILED_PATTERNS) {
    result = result.replace(new RegExp(source, flags), REDACTION_REPLACEMENT);
  }
  return result;
}

/**
 * Redact secrets but replace each match with a length hint — `[REDACTED:<n>]`
 * — instead of an opaque `[REDACTED]` (F6). Used for run_and_watch raw_output,
 * where the agent's debugging depends on knowing a value was present and its
 * length, without leaking the value itself.
 *
 * @param line - Raw log line to redact.
 * @returns The line with each detected secret replaced by `[REDACTED:<length>]`.
 */
export function redactWithHint(line: string): string {
  if (!line) return line;

  let result = line;
  for (const [_name, source, flags] of COMPILED_PATTERNS) {
    result = result.replace(new RegExp(source, flags), (m) => `[REDACTED:${m.length}]`);
  }
  return result;
}
