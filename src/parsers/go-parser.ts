/**
 * Go error parser for TracePulse.
 *
 * Detects and extracts structured data from Go panic output and runtime errors.
 * Go panics produce a distinctive format: a `panic:` line followed by goroutine
 * headers and stack frames with `file.go:N +0xNN` patterns.
 *
 * This parser handles:
 * - `panic: <message>` lines (with or without goroutine stack traces)
 * - `goroutine N [running]:` headers followed by stack frames
 * - `panic: runtime error: <type>` for built-in runtime panics
 *
 * @see src/types/parsers.ts for the ErrorParser interface
 * @see src/constants/limits.ts for MAX_STACK_FRAMES
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";
import { MAX_STACK_FRAMES } from "@/constants/limits.js";

// ──────────────────────────────────────────────
// Detection Patterns
// ──────────────────────────────────────────────

/** Matches `goroutine N [running]:` - the header of a Go stack trace. */
const GOROUTINE_RE = /goroutine \d+ \[running\]:/;

/** Matches `panic: <message>` - the panic trigger line. */
const PANIC_RE = /^panic: /m;

/**
 * Matches Go stack frame file references.
 * Captures: (1) file path, (2) line number.
 * Handles both `/path/file.go:42 +0x1a4` and `/path/file.go:42` formats.
 */
const FRAME_FILE_RE = /^\t(.+\.go):(\d+)/;

/**
 * Matches `runtime error: <type>` inside a panic message.
 * Captures: (1) the runtime error type (e.g., "index out of range").
 * The type is extracted up to the first `[` or end of string to strip
 * the specific index/length details while keeping the error category.
 */
const RUNTIME_ERROR_RE = /^runtime error: ([^\[]+)/;

// ──────────────────────────────────────────────
// Parser Implementation
// ──────────────────────────────────────────────

/**
 * Go error parser instance.
 *
 * Implements ErrorParser for Go panic output. Registered in the parser
 * registry alongside Node.js, Python, and other framework parsers.
 * The first parser whose canParse returns true wins.
 */
export const goParser: ErrorParser = {
  name: "go",

  /**
   * Test whether the input contains Go panic or goroutine patterns.
   * Checks for `goroutine N [running]:`, `panic:`, or `runtime error:`.
   *
   * @param line - Raw log line or multi-line block from the collector
   * @returns true if this looks like Go panic/error output
   */
  canParse(line: string): boolean {
    return GOROUTINE_RE.test(line) || PANIC_RE.test(line);
  },

  /**
   * Parse Go panic output into a structured ParsedError.
   *
   * Extracts the panic message, stack frames (limited to MAX_STACK_FRAMES),
   * and the first user-code file:line reference. Sets scoring hints to flag
   * panics as unhandled exceptions.
   *
   * @param line - Raw log line or multi-line block that passed canParse
   * @returns ParsedError with Go-specific context, or null if parsing fails
   */
  parse(line: string): ParsedError | null {
    const lines = line.split("\n");

    // Extract panic message from `panic: <msg>` line
    const panicLine = lines.find((l) => PANIC_RE.test(l));
    const panicMsg = panicLine ? panicLine.replace(/^panic:\s*/, "") : null;

    // Determine error_type: "runtime error: <type>" or generic "panic"
    let errorType = "panic";
    if (panicMsg) {
      const rtMatch = panicMsg.match(RUNTIME_ERROR_RE);
      if (rtMatch) {
        errorType = `runtime error: ${rtMatch[1].trim()}`;
      }
    }

    // Extract stack frames - lines starting with \t that match .go:N
    const frameLines: string[] = [];
    let firstFile: string | undefined;
    let firstLine: number | undefined;

    let frameCount = 0;
    for (const l of lines) {
      const fileMatch = l.match(FRAME_FILE_RE);
      if (fileMatch) {
        if (frameCount >= MAX_STACK_FRAMES) break;
        frameCount++;
        frameLines.push(l);
        // Capture the first file:line as the error location
        if (!firstFile) {
          firstFile = fileMatch[1];
          firstLine = parseInt(fileMatch[2], 10);
        }
      } else if (l.startsWith("\t")) {
        // Non-file frame line (e.g., function signature) - skip
      } else if (frameCount > 0 || GOROUTINE_RE.test(l)) {
        // Include goroutine headers and function names in trace
        if (frameCount < MAX_STACK_FRAMES) {
          frameLines.push(l);
        }
      }
    }

    const hasStack = frameLines.length > 0;
    const stackTrace = hasStack ? frameLines.join("\n") : undefined;

    // Build the display message: prefer panic message, fall back to goroutine header
    const message = panicMsg
      ?? lines.find((l) => GOROUTINE_RE.test(l))
      ?? line.slice(0, 200);

    return {
      message,
      level: "error",
      stack_trace: stackTrace,
      context: {
        framework: "go",
        error_type: errorType,
        ...(firstFile !== undefined && { file: firstFile }),
        ...(firstLine !== undefined && { line: firstLine }),
      },
      scoring_hints: {
        is_unhandled_exception: true,
        has_stack_trace: hasStack,
        is_user_code: firstFile ? !firstFile.includes("/usr/local/go/") : undefined,
      },
    };
  },
};
