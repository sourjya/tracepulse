/**
 * Pytest output parser for TracePulse.
 *
 * Parses pytest FAILED/ERROR lines and summary into structured events.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** FAILED tests/test_auth.py::test_login - AssertionError: ... */
const FAILED_PATTERN = /^FAILED\s+(\S+?)(?:::(\S+))?\s*(?:-\s*(\w+Error|AssertionError)?:?\s*(.*))?$/;

/** ERROR tests/test_auth.py - ImportError: ... */
const ERROR_PATTERN = /^ERROR\s+(\S+?)(?:\s*-\s*(\w+Error|ImportError)?:?\s*(.*))?$/;

/** ===== 2 failed, 15 passed in 3.45s ===== or ===== 554 passed, 11 warnings in 8.98s ===== */
const SUMMARY_PATTERN = /^=+\s*(.*(?:passed|failed|error).*)\s*=+$/;

export const pytestParser: ErrorParser = {
  name: "pytest",

  canParse(line: string): boolean {
    return FAILED_PATTERN.test(line) || ERROR_PATTERN.test(line) || SUMMARY_PATTERN.test(line);
  },

  parse(line: string): ParsedError | null {
    const failMatch = line.match(FAILED_PATTERN);
    if (failMatch) {
      const [, filePath, , errorType, detail] = failMatch;
      const file = filePath.includes("::") ? filePath.split("::")[0] : filePath;
      return {
        message: detail?.trim() || `Test failed: ${filePath}`,
        level: "error",
        context: { file, error_type: errorType || undefined, framework: "pytest" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    const errMatch = line.match(ERROR_PATTERN);
    if (errMatch) {
      const [, filePath, errorType, detail] = errMatch;
      return {
        message: detail?.trim() || `Collection error: ${filePath}`,
        level: "error",
        context: { file: filePath, error_type: errorType || undefined, framework: "pytest" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    const sumMatch = line.match(SUMMARY_PATTERN);
    if (sumMatch) {
      const summary = sumMatch[1].trim();
      const hasFailed = /failed|error/i.test(summary);
      return {
        message: `pytest: ${summary}`,
        level: hasFailed ? "warn" : "info",
        context: { framework: "pytest" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    return null;
  },
};
