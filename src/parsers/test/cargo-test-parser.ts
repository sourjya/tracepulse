/**
 * Cargo test (Rust) output parser for TracePulse.
 *
 * Parses `cargo test` output: individual test failures, summary line,
 * and panic messages with file:line extraction.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** test result: FAILED. 2 passed; 1 failed; 0 ignored */
const SUMMARY = /^test result: (FAILED|ok)\.\s+(\d+) passed;\s+(\d+) failed/;

/** ---- tests::test_login stdout ---- or test tests::test_login ... FAILED */
const TEST_FAILED = /^test\s+(\S+)\s+\.\.\.\s+FAILED/;

/** thread 'tests::test_login' panicked at 'assertion failed' */
const PANIC = /thread '([^']+)' panicked at '([^']+)'(?:,\s*(.+):(\d+))?/;

/** failures: */
const FAILURES_HEADER = /^failures:$/;

export const cargoTestParser: ErrorParser = {
  name: "cargo-test",

  canParse(line: string): boolean {
    return SUMMARY.test(line) || TEST_FAILED.test(line) || PANIC.test(line) || FAILURES_HEADER.test(line);
  },

  parse(line: string): ParsedError | null {
    const panicMatch = line.match(PANIC);
    if (panicMatch) {
      return {
        message: `${panicMatch[1]}: ${panicMatch[2]}`,
        level: "error",
        context: {
          error_type: "PanicError",
          framework: "cargo-test",
          ...(panicMatch[3] ? { file: panicMatch[3] } : {}),
          ...(panicMatch[4] ? { line: parseInt(panicMatch[4], 10) } : {}),
        },
        scoring_hints: { is_unhandled_exception: true, is_user_code: true },
      };
    }

    const failMatch = line.match(TEST_FAILED);
    if (failMatch) {
      return {
        message: `Test failed: ${failMatch[1]}`,
        level: "error",
        context: { framework: "cargo-test" },
        scoring_hints: { is_user_code: true },
      };
    }

    const sumMatch = line.match(SUMMARY);
    if (sumMatch) {
      const hasFailed = sumMatch[1] === "FAILED";
      return {
        message: `cargo test: ${sumMatch[2]} passed, ${sumMatch[3]} failed`,
        level: hasFailed ? "warn" : "info",
        context: { framework: "cargo-test" },
        scoring_hints: {},
      };
    }

    return null;
  },
};
