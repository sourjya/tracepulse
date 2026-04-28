/**
 * Node.js error parser for the TracePulse pipeline.
 *
 * Detects standard V8/Node.js error patterns (TypeError, ReferenceError,
 * SyntaxError, etc.) from raw log output and extracts structured data:
 * error message, stack trace frames, source file location, and scoring hints.
 *
 * Input is a single multi-line string — the full error block joined with \n.
 * The parser skips node_modules and node:internal frames when determining
 * the user-code file:line:column for EventContext.
 *
 * This is the first parser in the registry. Additional framework parsers
 * (e.g., python, vite) implement the same ErrorParser interface.
 *
 * @see src/types/parsers.ts for the ErrorParser interface
 * @see src/constants/limits.ts for MAX_STACK_FRAMES
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";
import { MAX_STACK_FRAMES } from "@/constants/limits.js";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/**
 * Standard V8 error types that appear at the start of error lines.
 * Matches patterns like "TypeError: message", "Error: message", or
 * "UnhandledPromiseRejectionWarning: Error: message" (Node.js <= 14 format).
 */
const ERROR_TYPE_PATTERN =
  /^(?:.*\n)*?(?:\w+Warning:\s*)?(TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error):\s*(.+)/m;

/**
 * Stack frame with parenthesized location: "at FunctionName (file:line:col)".
 * Captures function name (optional), file path, line number, and column number.
 */
const FRAME_WITH_PARENS = /^\s+at\s+(?:.+?)\s+\((.+?):(\d+):(\d+)\)/;

/**
 * Stack frame without parentheses: "at file:line:col".
 * Used when V8 omits the function name for anonymous contexts.
 */
const FRAME_WITHOUT_PARENS = /^\s+at\s+(.+?):(\d+):(\d+)$/;

/**
 * Detects stack frame lines — any line with leading whitespace followed by "at ".
 * Used by canParse for quick detection without full parsing.
 */
const STACK_FRAME_LINE = /^\s+at\s+/m;

/**
 * Patterns indicating an unhandled exception or unhandled promise rejection.
 * These signal high-severity events to the scorer.
 */
const UNHANDLED_PATTERNS = [
  /uncaughtexception/i,
  /unhandledpromiserejection/i,
  /unhandled/i,
  /uncaught/i,
];

/**
 * Matches HTTP status codes in error messages like "status code 500".
 * Extracts the numeric status for scoring_hints.http_status.
 */
const HTTP_STATUS_PATTERN = /status\s+(?:code\s+)?(\d{3})/i;

/**
 * Patterns that indicate non-Node.js errors — used to reject input early.
 * Python tracebacks start with "Traceback", Go panics with "goroutine".
 */
const NON_NODE_PATTERNS = [/^Traceback\s/m, /^goroutine\s/m];

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Determine whether a stack frame file path points to non-user code.
 * Returns true for node_modules paths and node:internal built-in modules.
 *
 * @param filePath - The file path extracted from a stack frame
 * @returns True if the frame should be skipped for user-code context
 */
function isInternalFrame(filePath: string): boolean {
  return filePath.includes("node_modules") || filePath.startsWith("node:");
}

/**
 * Parse a single stack frame line into file, line, and column.
 * Tries parenthesized format first, then bare path format.
 *
 * @param frameLine - A single line from the stack trace (e.g., "    at fn (/app/src/x.ts:10:5)")
 * @returns Parsed location or null if the line doesn't match either format
 */
function parseFrame(
  frameLine: string,
): { file: string; line: number; column: number } | null {
  const withParens = frameLine.match(FRAME_WITH_PARENS);
  if (withParens) {
    return {
      file: withParens[1],
      line: parseInt(withParens[2], 10),
      column: parseInt(withParens[3], 10),
    };
  }
  const withoutParens = frameLine.match(FRAME_WITHOUT_PARENS);
  if (withoutParens) {
    return {
      file: withoutParens[1],
      line: parseInt(withoutParens[2], 10),
      column: parseInt(withoutParens[3], 10),
    };
  }
  return null;
}

// ──────────────────────────────────────────────
// Parser Implementation
// ──────────────────────────────────────────────

/**
 * Node.js error parser instance.
 *
 * Implements the ErrorParser interface for V8/Node.js runtime errors.
 * Registered in the parser pipeline; tried against every incoming log block.
 * The first parser whose canParse returns true wins.
 */
export const nodeParser: ErrorParser = {
  name: "node",

  /**
   * Test whether the input contains a Node.js error pattern.
   * Checks for standard error type prefixes (TypeError:, Error:, etc.)
   * or stack frame lines ("at " patterns). Rejects known non-Node patterns
   * (Python tracebacks, Go panics) to avoid false positives.
   *
   * @param line - The full multi-line error block
   * @returns True if this parser should attempt to parse the input
   */
  canParse(line: string): boolean {
    if (!line) return false;

    // Reject known non-Node.js patterns early
    for (const pattern of NON_NODE_PATTERNS) {
      if (pattern.test(line)) return false;
    }

    return ERROR_TYPE_PATTERN.test(line) || STACK_FRAME_LINE.test(line);
  },

  /**
   * Parse a Node.js error block into structured data.
   * Extracts the error type, message, stack frames, and first user-code
   * file:line:column. Returns null if the input matched canParse but
   * doesn't contain an extractable error message line.
   *
   * @param line - The full multi-line error block
   * @returns ParsedError with message, stack trace, context, and scoring hints, or null
   */
  parse(line: string): ParsedError | null {
    const errorMatch = line.match(ERROR_TYPE_PATTERN);
    // If no error type line found, we can't extract structured data
    if (!errorMatch) return null;

    const errorType = errorMatch[1];
    const message = errorMatch[2];

    // Extract all stack frame lines
    const allLines = line.split("\n");
    const frameLines = allLines.filter((l) => STACK_FRAME_LINE.test(l));
    const hasStackTrace = frameLines.length > 0;

    // Truncate to MAX_STACK_FRAMES
    const truncatedFrames = frameLines.slice(0, MAX_STACK_FRAMES);
    const stackTrace = hasStackTrace
      ? truncatedFrames.join("\n")
      : undefined;

    // Find first user-code frame for context
    let userFile: string | undefined;
    let userLine: number | undefined;
    let userColumn: number | undefined;
    let isUserCode = false;

    for (const frame of truncatedFrames) {
      const parsed = parseFrame(frame);
      if (parsed && !isInternalFrame(parsed.file)) {
        userFile = parsed.file;
        userLine = parsed.line;
        userColumn = parsed.column;
        isUserCode = true;
        break;
      }
    }

    // Detect unhandled exception/rejection patterns
    const isUnhandled = UNHANDLED_PATTERNS.some((p) => p.test(line));

    // Extract HTTP status code if present
    const httpMatch = message.match(HTTP_STATUS_PATTERN);
    const httpStatus = httpMatch ? parseInt(httpMatch[1], 10) : undefined;

    return {
      message,
      stack_trace: stackTrace,
      level: "error",
      context: {
        framework: "node",
        error_type: errorType,
        ...(userFile !== undefined && { file: userFile }),
        ...(userLine !== undefined && { line: userLine }),
        ...(userColumn !== undefined && { column: userColumn }),
      },
      scoring_hints: {
        has_stack_trace: hasStackTrace,
        is_user_code: isUserCode,
        ...(isUnhandled && { is_unhandled_exception: true }),
        ...(httpStatus !== undefined && { http_status: httpStatus }),
      },
    };
  },
};
