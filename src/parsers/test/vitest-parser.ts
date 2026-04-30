/**
 * Vitest output parser for TracePulse.
 *
 * Parses vitest FAIL lines, assertion errors, and summary.
 * Vitest output is similar to Jest but has its own markers.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** FAIL tests/unit/auth.test.ts > login > should validate */
const FAIL_LINE = /^\s*[x\u2715]\s+(.+?)(?:\s+\d+\s*ms)?$/;

/** FAIL  tests/unit/auth.test.ts (vitest file-level failure) */
const FAIL_FILE = /^\s*(?:FAIL|❯)\s+(\S+\.(?:test|spec)\.\w+)/;

/** AssertionError: expected X to be Y */
const ASSERTION = /^\s*(AssertionError|Error):\s+(.+)/;

/** Test Files  1 failed | 5 passed or Test Files  5 passed (5) */
const SUMMARY_FAIL = /Test Files\s+(\d+)\s+failed/;
const SUMMARY_PASS = /Tests\s+(\d+)\s+passed/;

export const vitestParser: ErrorParser = {
  name: "vitest",

  canParse(line: string): boolean {
    return FAIL_FILE.test(line) || FAIL_LINE.test(line) || ASSERTION.test(line) || SUMMARY_FAIL.test(line) || SUMMARY_PASS.test(line);
  },

  parse(line: string): ParsedError | null {
    const fileMatch = line.match(FAIL_FILE);
    if (fileMatch) {
      return {
        message: `Test file failed: ${fileMatch[1]}`,
        level: "error",
        context: { file: fileMatch[1], framework: "vitest" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    const failMatch = line.match(FAIL_LINE);
    if (failMatch) {
      return {
        message: failMatch[1].trim(),
        level: "error",
        context: { framework: "vitest" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    const assertMatch = line.match(ASSERTION);
    if (assertMatch) {
      return {
        message: `${assertMatch[1]}: ${assertMatch[2]}`,
        level: "error",
        context: { error_type: assertMatch[1], framework: "vitest" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    const sumMatch = line.match(SUMMARY_FAIL);
    if (sumMatch) {
      return {
        message: `vitest: ${sumMatch[1]} test file(s) failed`,
        level: "warn",
        context: { framework: "vitest" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    const passMatch = line.match(SUMMARY_PASS);
    if (passMatch) {
      return {
        message: `vitest: ${passMatch[1]} tests passed`,
        level: "info",
        context: { framework: "vitest" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    return null;
  },
};
