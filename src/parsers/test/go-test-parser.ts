/**
 * Go test output parser for TracePulse.
 *
 * Parses `go test` output: --- FAIL, FAIL summary, panic lines.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** --- FAIL: TestLogin (0.00s) */
const GO_FAIL = /^---\s+FAIL:\s+(\S+)\s+\(([^)]+)\)/;

/** FAIL	github.com/user/pkg	0.005s */
const GO_FAIL_SUMMARY = /^FAIL\s+(\S+)\s+([\d.]+s)/;

/** Error message from t.Errorf/t.Fatalf */
const GO_ERROR_MSG = /^\s+(\S+\.go):(\d+):\s+(.+)/;

export const goTestParser: ErrorParser = {
  name: "go-test",

  canParse(line: string): boolean {
    return GO_FAIL.test(line) || GO_FAIL_SUMMARY.test(line) || GO_ERROR_MSG.test(line);
  },

  parse(line: string): ParsedError | null {
    const failMatch = line.match(GO_FAIL);
    if (failMatch) {
      return {
        message: `Test failed: ${failMatch[1]} (${failMatch[2]})`,
        level: "error",
        context: { error_type: "TestFailure", framework: "go-test" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    const summaryMatch = line.match(GO_FAIL_SUMMARY);
    if (summaryMatch) {
      return {
        message: `Package failed: ${summaryMatch[1]} (${summaryMatch[2]})`,
        level: "error",
        context: { framework: "go-test" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    const errorMatch = line.match(GO_ERROR_MSG);
    if (errorMatch) {
      return {
        message: errorMatch[3],
        level: "error",
        context: { file: errorMatch[1], line: parseInt(errorMatch[2], 10), framework: "go-test" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    return null;
  },
};
