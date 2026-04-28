/**
 * Rust panic error parser for TracePulse.
 *
 * Detects and parses Rust panic messages from both the legacy format
 * (thread 'name' panicked at 'msg', file:line:col) and the newer format
 * (thread 'name' panicked at file:line:col:\nmsg). Also extracts stack
 * frames from RUST_BACKTRACE output when present.
 *
 * Fits into the parser registry as a pluggable ErrorParser - the registry
 * calls canParse() on each line, and if it matches, calls parse() to
 * produce a ParsedError for the normalizer.
 *
 * @see src/types/parsers.ts for the ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";
import { MAX_STACK_FRAMES } from "@/constants/limits.js";

// ──────────────────────────────────────────────
// Detection Patterns
// ──────────────────────────────────────────────

/**
 * Matches Rust panic output: thread '<name>' panicked at ...
 * Works for both legacy and newer formats since the prefix is identical.
 */
const PANIC_PATTERN = /thread '([^']+)' panicked at /;

/** Matches RUST_BACKTRACE header line. */
const BACKTRACE_HEADER = /^stack backtrace:/m;

/**
 * Legacy format: thread 'name' panicked at 'message', file:line:col
 * The message is wrapped in single quotes, followed by comma and location.
 */
const LEGACY_PANIC =
  /thread '[^']+' panicked at '([^']*(?:''[^']*)*)', ([^:]+):(\d+):(\d+)/;

/**
 * Newer format: thread 'name' panicked at file:line:col:\nmessage
 * Location comes before the message, separated by colon-newline.
 */
const NEWER_PANIC =
  /thread '[^']+' panicked at ([^:]+):(\d+):(\d+):\n(.+)/s;

/**
 * Matches a single RUST_BACKTRACE frame.
 * Format: "   N: function_name\n             at path/to/file.rs:line:col"
 */
const BACKTRACE_FRAME = /^\s*(\d+): (.+?)(?:\n\s+at (.+?))?$/gm;

// ──────────────────────────────────────────────
// Parser Implementation
// ──────────────────────────────────────────────

/**
 * Extracts stack trace string from RUST_BACKTRACE output.
 * Limits to MAX_STACK_FRAMES frames to keep MCP responses token-efficient.
 *
 * @param input - Full log output that may contain backtrace frames
 * @returns Formatted stack trace string, or undefined if no frames found
 */
function extractBacktrace(input: string): string | undefined {
  const headerIdx = input.search(BACKTRACE_HEADER);
  if (headerIdx === -1) return undefined;

  const backtraceSection = input.slice(headerIdx);
  const frames: string[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state for each call
  const frameRegex = new RegExp(BACKTRACE_FRAME.source, "gm");
  while ((match = frameRegex.exec(backtraceSection)) !== null) {
    if (frames.length >= MAX_STACK_FRAMES) break;
    // Reconstruct frame: "N: function\n  at location"
    let frame = `   ${match[1]}: ${match[2]}`;
    if (match[3]) {
      frame += `\n             at ${match[3]}`;
    }
    frames.push(frame);
  }

  return frames.length > 0 ? frames.join("\n") : undefined;
}

/**
 * Rust error parser. Detects thread panics and RUST_BACKTRACE output,
 * extracts panic message, source location, and stack frames.
 *
 * Exported as a singleton - the parser registry imports this directly.
 * Stateless: all methods are pure functions operating on the input string.
 */
export const rustParser: ErrorParser = {
  name: "rust",

  /**
   * Returns true if the line contains a Rust panic or RUST_BACKTRACE output.
   * Fast regex test - no allocations beyond the regex engine.
   *
   * @param line - Raw log line(s) from the process collector
   * @returns True if this parser should attempt to parse the line
   */
  canParse(line: string): boolean {
    return PANIC_PATTERN.test(line) || BACKTRACE_HEADER.test(line);
  },

  /**
   * Parses a Rust panic line into a ParsedError.
   * Tries legacy format first, then newer format. Extracts backtrace
   * if RUST_BACKTRACE output is present in the input.
   *
   * @param line - Raw log line(s) that passed canParse
   * @returns ParsedError with panic details, or null if parsing fails
   */
  parse(line: string): ParsedError | null {
    let message: string | undefined;
    let file: string | undefined;
    let lineNum: number | undefined;
    let column: number | undefined;

    // Try legacy format: thread 'x' panicked at 'msg', file:line:col
    const legacyMatch = LEGACY_PANIC.exec(line);
    if (legacyMatch) {
      message = legacyMatch[1];
      file = legacyMatch[2];
      lineNum = parseInt(legacyMatch[3], 10);
      column = parseInt(legacyMatch[4], 10);
    }

    // Try newer format: thread 'x' panicked at file:line:col:\nmsg
    if (!message) {
      const newerMatch = NEWER_PANIC.exec(line);
      if (newerMatch) {
        file = newerMatch[1];
        lineNum = parseInt(newerMatch[2], 10);
        column = parseInt(newerMatch[3], 10);
        message = newerMatch[4].trim();
      }
    }

    // If neither format matched, we can't produce a useful ParsedError
    if (!message) return null;

    const stackTrace = extractBacktrace(line);

    return {
      message,
      level: "error",
      stack_trace: stackTrace,
      context: {
        framework: "rust",
        error_type: "panic",
        file,
        line: lineNum,
        column,
      },
      scoring_hints: {
        is_unhandled_exception: true,
        has_stack_trace: stackTrace !== undefined,
      },
    };
  },
};
