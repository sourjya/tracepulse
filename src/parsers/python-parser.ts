/**
 * Python error parser for TracePulse.
 *
 * Detects and extracts structured data from Python tracebacks and standalone
 * exception lines. Handles the standard CPython traceback format:
 *   Traceback (most recent call last):
 *     File "path", line N, in function_name
 *       code_line
 *   ExceptionType: message
 *
 * Also matches standalone exception lines (e.g., "ValueError: invalid literal")
 * that appear without a full traceback.
 *
 * @see ErrorParser interface in types/parsers.ts
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** Matches the Python traceback header line. */
const TRACEBACK_HEADER = "Traceback (most recent call last):";

/**
 * Python exception types recognized by this parser.
 * Only types with a colon suffix are matched to avoid false positives
 * on Node.js errors like "TypeError: Cannot read properties of undefined".
 */
const PYTHON_EXCEPTION_TYPES = [
  "ModuleNotFoundError",
  "ImportError",
  "TypeError",
  "ValueError",
  "KeyError",
  "AttributeError",
  "NameError",
  "FileNotFoundError",
  "IndentationError",
  "SyntaxError",
  "RuntimeError",
  "OSError",
  "IOError",
  "StopIteration",
  "ZeroDivisionError",
  "IndexError",
  "NotImplementedError",
  "PermissionError",
  "ConnectionError",
  "TimeoutError",
] as const;

/**
 * Matches a standalone Python exception line.
 * Requires the exception type to be followed by a colon and a space,
 * which distinguishes Python exceptions from Node.js errors that use
 * different message patterns (e.g., "Cannot read properties").
 */
const EXCEPTION_LINE_RE = new RegExp(
  `^(${PYTHON_EXCEPTION_TYPES.join("|")}): .+`,
);

/**
 * Matches a Python traceback frame line.
 * Captures: file path, line number, function name.
 * Format: '  File "path", line N, in function_name'
 */
const FRAME_RE = /^\s*File "(.+)", line (\d+), in (.+)$/;

/**
 * Patterns that indicate a Node.js error — used to reject false positives
 * on generic exception types like TypeError that exist in both languages.
 * These patterns appear in the message portion AFTER the colon, not in
 * the exception type prefix itself.
 */
const NODE_MESSAGE_PATTERNS = [
  "Cannot read propert",
  "is not a function",
  "ENOENT:",
  "EACCES:",
];

/**
 * Patterns that indicate Node.js stack frames or error format.
 */
const NODE_FRAME_PATTERNS = ["    at "];

// ──────────────────────────────────────────────
// Parser Implementation
// ──────────────────────────────────────────────

/**
 * Determine if a line looks like a Node.js error rather than Python.
 * Checks the message portion (after the colon) for Node.js-specific patterns,
 * and checks for Node.js stack frame format.
 *
 * @param line - Raw log line to check
 * @returns True if the line matches Node.js error patterns
 */
function isNodeError(line: string): boolean {
  if (NODE_FRAME_PATTERNS.some((p) => line.includes(p))) return true;
  // Check message portion only (after "ExceptionType: ")
  const colonIdx = line.indexOf(": ");
  const message = colonIdx !== -1 ? line.slice(colonIdx + 2) : line;
  return NODE_MESSAGE_PATTERNS.some((p) => message.includes(p));
}

/**
 * Check if a traceback frame path is from site-packages (library code).
 *
 * @param filePath - File path from a traceback frame
 * @returns True if the path is inside site-packages or dist-packages
 */
function isSitePackages(filePath: string): boolean {
  return filePath.includes("site-packages") || filePath.includes("dist-packages");
}

/**
 * Extract the exception type from an exception line like "ValueError: message".
 *
 * @param line - The exception line
 * @returns The exception type name, or undefined if not matched
 */
function extractErrorType(line: string): string | undefined {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return undefined;
  const candidate = line.slice(0, colonIdx);
  // Verify it's a known Python exception type (no spaces, starts uppercase)
  if (/^[A-Z][a-zA-Z]+Error$|^[A-Z][a-zA-Z]+$/.test(candidate)) {
    return candidate;
  }
  return undefined;
}

/**
 * Python error parser implementing the ErrorParser interface.
 *
 * Detects Python tracebacks and standalone exception lines, extracts
 * structured error data including file:line from the most relevant
 * user-code frame (skipping site-packages).
 *
 * Collaborates with the parser registry (Phase 1) which tries parsers
 * in order — this parser should be registered alongside the Node parser.
 */
export const pythonParser: ErrorParser = {
  name: "python",

  /**
   * Test whether the input contains a Python traceback or exception.
   * Rejects Node.js errors that share exception type names (e.g., TypeError).
   *
   * @param line - Raw log line(s), possibly multi-line with \n
   * @returns True if this parser can handle the input
   */
  canParse(line: string): boolean {
    if (line.includes(TRACEBACK_HEADER)) return true;
    const lastLine = (line.trim().split("\n").pop() ?? "").trim();
    if (!EXCEPTION_LINE_RE.test(lastLine)) return false;
    // Matched a Python exception type — reject if the message is Node.js-specific
    return !isNodeError(lastLine);
  },

  /**
   * Parse Python traceback or exception line into a ParsedError.
   * Extracts message, stack trace, file:line from the last user-code frame,
   * and sets scoring hints for the signal scorer.
   *
   * @param line - Raw log line(s), possibly multi-line with \n
   * @returns ParsedError with extracted data, or null if parsing fails
   */
  parse(line: string): ParsedError | null {
    const lines = line.split("\n");
    const hasTraceback = line.includes(TRACEBACK_HEADER);

    // Find the exception message — last non-empty line
    const messageLine = lines
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .pop();

    if (!messageLine) return null;

    const errorType = extractErrorType(messageLine);
    if (!errorType && !hasTraceback) return null;

    // Extract traceback frames
    let stackTrace: string | undefined;
    let userFile: string | undefined;
    let userLine: number | undefined;
    let hasUserCode = false;

    if (hasTraceback) {
      const frames: string[] = [];
      let lastUserFile: string | undefined;
      let lastUserLine: number | undefined;

      for (const raw of lines) {
        const match = FRAME_RE.exec(raw);
        if (match) {
          frames.push(raw.trim());
          const [, filePath, lineNum] = match;
          if (!isSitePackages(filePath)) {
            lastUserFile = filePath;
            lastUserLine = Number(lineNum);
          }
        }
      }

      if (frames.length > 0) {
        stackTrace = frames.join("\n");
      }

      if (lastUserFile !== undefined) {
        userFile = lastUserFile;
        userLine = lastUserLine;
        hasUserCode = true;
      } else if (frames.length > 0) {
        // All frames are site-packages — use the last frame anyway
        const lastMatch = FRAME_RE.exec(frames[frames.length - 1]);
        if (lastMatch) {
          userFile = lastMatch[1];
          userLine = Number(lastMatch[2]);
        }
      }
    }

    return {
      message: messageLine,
      level: "error",
      stack_trace: stackTrace,
      context: {
        framework: "python",
        error_type: errorType,
        ...(userFile !== undefined && { file: userFile }),
        ...(userLine !== undefined && { line: userLine }),
      },
      scoring_hints: {
        is_unhandled_exception: true,
        has_stack_trace: hasTraceback && stackTrace !== undefined,
        is_user_code: hasUserCode,
      },
    };
  },
};
