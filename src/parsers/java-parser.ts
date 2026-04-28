/**
 * Java/JVM error parser for TracePulse.
 *
 * Detects and parses Java exception output including "Exception in thread",
 * fully-qualified exception class names, stack frames, and "Caused by:" chains.
 * Handles output from any JVM language (Java, Kotlin, Scala) that follows the
 * standard JVM exception format.
 *
 * Architecture: implements the ErrorParser interface from types/parsers.ts.
 * The parser registry tries each parser's canParse() in order; this parser
 * matches JVM-specific patterns. When chained exceptions are present, the
 * root cause (last "Caused by:") is used as the primary error.
 *
 * @see src/types/parsers.ts for the ErrorParser interface
 * @see src/constants/limits.ts for MAX_STACK_FRAMES
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";
import { MAX_STACK_FRAMES } from "@/constants/limits.js";

// ──────────────────────────────────────────────
// Detection Patterns
// ──────────────────────────────────────────────

/** Matches "Exception in thread" JVM crash header. */
const EXCEPTION_IN_THREAD_RE = /Exception in thread\s/;

/**
 * Matches fully-qualified Java exception class names.
 * Format: `java.lang.NullPointerException` or `com.example.CustomException`.
 * Requires at least two dot-separated segments ending in Exception/Error.
 */
const JAVA_EXCEPTION_CLASS_RE =
  /\b([\w]+(?:\.[\w]+)+(?:Exception|Error))\b/;

/** Matches JVM stack frame lines: `at com.example.Class.method(File.java:42)`. */
const STACK_FRAME_RE = /^\s*at\s+(com\.|org\.)/;

/** Matches "Caused by:" chained exception lines. */
const CAUSED_BY_RE = /^Caused by:\s/;

// ──────────────────────────────────────────────
// Parsing Patterns
// ──────────────────────────────────────────────

/**
 * Extracts exception class and optional message from an exception line.
 * Handles both "Exception in thread "main" pkg.ExClass: msg" and "pkg.ExClass: msg".
 */
const EXCEPTION_LINE_RE =
  /(?:Exception in thread\s+"[^"]*"\s+)?([\w]+(?:\.[\w]+)*(?:Exception|Error))(?::\s*(.*))?/;

/**
 * Extracts file and line from a JVM stack frame.
 * Format: `at com.example.MyClass.myMethod(MyClass.java:42)`.
 */
const FRAME_DETAIL_RE =
  /^\s*at\s+([\w.]+)\(([\w.]+):(\d+)\)/;

/**
 * JDK internal package prefixes - frames from these packages are skipped
 * when determining user code file:line. They still appear in the stack trace
 * string but don't influence context.file or scoring_hints.is_user_code.
 */
const JDK_INTERNAL_PREFIXES = [
  "java.",
  "javax.",
  "sun.",
  "jdk.internal.",
  "com.sun.",
] as const;

// ──────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────

/**
 * Check if a stack frame belongs to JDK internals.
 * Used to skip framework/JDK frames when locating user code.
 *
 * @param fqn - Fully-qualified class name from the stack frame
 * @returns True if the frame is a JDK internal frame
 */
function isJdkInternal(fqn: string): boolean {
  return JDK_INTERNAL_PREFIXES.some((prefix) => fqn.startsWith(prefix));
}

/**
 * Extract the short class name from a fully-qualified exception name.
 * E.g., "java.lang.NullPointerException" → "NullPointerException".
 *
 * @param fqn - Fully-qualified exception class name
 * @returns The simple class name
 */
function shortClassName(fqn: string): string {
  const lastDot = fqn.lastIndexOf(".");
  return lastDot >= 0 ? fqn.substring(lastDot + 1) : fqn;
}

// ──────────────────────────────────────────────
// Parser Implementation
// ──────────────────────────────────────────────

/**
 * Java/JVM error parser.
 *
 * Responsibilities:
 * - Detect JVM exception output via canParse()
 * - Extract exception class, message, stack frames, and file:line via parse()
 * - Follow "Caused by:" chains to the root cause
 * - Skip JDK internal frames when determining user code location
 *
 * Collaborators: used by the parser registry (future), produces ParsedError
 * consumed by the event normalizer.
 */
export const javaParser: ErrorParser = {
  name: "java",

  /**
   * Test whether the line looks like JVM exception output.
   * Checks for: "Exception in thread", Java exception class names,
   * "at com./org." stack frames, or "Caused by:" lines.
   *
   * @param line - Raw log line(s) to test
   * @returns True if this parser should handle the line
   */
  canParse(line: string): boolean {
    return (
      EXCEPTION_IN_THREAD_RE.test(line) ||
      CAUSED_BY_RE.test(line) ||
      JAVA_EXCEPTION_CLASS_RE.test(line) ||
      STACK_FRAME_RE.test(line)
    );
  },

  /**
   * Parse JVM exception output into a structured ParsedError.
   *
   * Strategy:
   * 1. Split input into lines
   * 2. Find exception lines and "Caused by:" lines - use the last (root cause)
   * 3. Collect stack frames, capped at MAX_STACK_FRAMES
   * 4. Find the first user-code frame (non-JDK) for file:line context
   *
   * @param line - Raw log line(s), potentially multi-line with \n
   * @returns ParsedError with extracted context, or null if parsing fails
   */
  parse(line: string): ParsedError | null {
    const lines = line.split("\n");

    // Collect all exception declarations - the last "Caused by:" is root cause
    let errorClass = "";
    let errorMessage = "";
    let isUnhandled = false;

    // Stack frame collection
    const frames: string[] = [];
    let userFile: string | undefined;
    let userLine: number | undefined;
    let hasUserCode = false;

    for (const raw of lines) {
      const trimmed = raw.trim();

      // Check for "Caused by:" - overrides previous exception as root cause
      if (CAUSED_BY_RE.test(trimmed)) {
        const causedMatch = trimmed
          .replace(/^Caused by:\s*/, "")
          .match(EXCEPTION_LINE_RE);
        if (causedMatch) {
          errorClass = causedMatch[1];
          errorMessage = causedMatch[2] ?? "";
        }
        // Reset user code tracking for the new cause's frames
        userFile = undefined;
        userLine = undefined;
        hasUserCode = false;
        continue;
      }

      // Check for "Exception in thread" or standalone exception line
      const exMatch = trimmed.match(EXCEPTION_LINE_RE);
      if (exMatch && !errorClass) {
        errorClass = exMatch[1];
        errorMessage = exMatch[2] ?? "";
        if (EXCEPTION_IN_THREAD_RE.test(trimmed)) {
          isUnhandled = true;
        }
        continue;
      }

      // Check for stack frame
      const frameMatch = trimmed.match(FRAME_DETAIL_RE);
      if (frameMatch && frames.length < MAX_STACK_FRAMES) {
        frames.push(trimmed);
        const [, fqn, file, lineNum] = frameMatch;
        // Set file:line from the first user-code frame only
        if (!hasUserCode && !isJdkInternal(fqn)) {
          userFile = file;
          userLine = parseInt(lineNum, 10);
          hasUserCode = true;
        }
      }
    }

    // Build the message from extracted parts
    const shortName = errorClass ? shortClassName(errorClass) : "JavaException";
    const message = errorMessage
      ? `${shortName}: ${errorMessage}`
      : shortName;

    return {
      message,
      level: "error",
      stack_trace:
        frames.length > 0 ? frames.join("\n") : undefined,
      context: {
        framework: "java",
        error_type: shortName,
        ...(userFile !== undefined && { file: userFile }),
        ...(userLine !== undefined && { line: userLine }),
      },
      scoring_hints: {
        is_unhandled_exception: isUnhandled || undefined,
        has_stack_trace: frames.length > 0,
        is_user_code: hasUserCode,
      },
    };
  },
};
