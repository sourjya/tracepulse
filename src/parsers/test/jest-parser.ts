/**
 * Jest output parser for TracePulse.
 *
 * Parses Jest FAIL headers, x failure lines, and Expected/Received assertions.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** FAIL src/auth.test.ts */
const FAIL_HEADER = /^FAIL\s+(\S+)/;

/** x test name (15 ms) */
const FAILURE_LINE = /^\s+[x\u2715]\s+(.+?)(?:\s+\(\d+\s*ms\))?$/;

/** Expected: X / Received: Y */
const ASSERTION_LINE = /^\s+(Expected|Received):\s+(.+)/;

/** Tests:  2 failed, 15 passed, 17 total or Test Suites: 1 failed, 5 passed */
const JEST_SUMMARY = /^(Tests|Test Suites):\s+(.*(?:passed|failed).*)$/;

export const jestParser: ErrorParser = {
  name: "jest",

  canParse(line: string): boolean {
    return FAIL_HEADER.test(line) || FAILURE_LINE.test(line) || ASSERTION_LINE.test(line) || JEST_SUMMARY.test(line);
  },

  parse(line: string): ParsedError | null {
    const headerMatch = line.match(FAIL_HEADER);
    if (headerMatch) {
      return {
        message: `Test suite failed: ${headerMatch[1]}`,
        level: "error",
        context: { file: headerMatch[1], framework: "jest" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    const failMatch = line.match(FAILURE_LINE);
    if (failMatch) {
      return {
        message: failMatch[1].trim(),
        level: "error",
        context: { framework: "jest" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    const assertMatch = line.match(ASSERTION_LINE);
    if (assertMatch) {
      return {
        message: `${assertMatch[1]}: ${assertMatch[2]}`,
        level: "error",
        context: { framework: "jest" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    const sumMatch = line.match(JEST_SUMMARY);
    if (sumMatch) {
      const hasFailed = /failed/i.test(sumMatch[2]);
      return {
        message: `jest: ${sumMatch[1]}: ${sumMatch[2]}`,
        level: hasFailed ? "warn" : "info",
        context: { framework: "jest" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    return null;
  },
};
