/**
 * Test coverage output parser for TracePulse.
 *
 * Parses Istanbul (jest/vitest) and pytest-cov coverage summaries.
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** Istanbul: Statements   : 85.23% ( 1234/1448 ) */
const ISTANBUL_LINE = /(?:Statements|Branches|Functions|Lines)\s*:\s*([\d.]+)%/;

/** pytest-cov: TOTAL    1234    567    54% */
const PYTEST_COV = /^TOTAL\s+\d+\s+\d+\s+(\d+)%/;

/** "All files" summary from Istanbul */
const ALL_FILES = /All files\s*\|\s*([\d.]+)/;

export const coverageParser: ErrorParser = {
  name: "coverage",

  canParse(line: string): boolean {
    return ISTANBUL_LINE.test(line) || PYTEST_COV.test(line) || ALL_FILES.test(line);
  },

  parse(line: string): ParsedError | null {
    const istanbulMatch = line.match(ISTANBUL_LINE);
    if (istanbulMatch) {
      const pct = parseFloat(istanbulMatch[1]);
      return {
        message: line.trim(),
        level: pct < 50 ? "warn" : "info",
        context: { framework: "coverage" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    const pytestMatch = line.match(PYTEST_COV);
    if (pytestMatch) {
      const pct = parseInt(pytestMatch[1], 10);
      return {
        message: `Coverage: ${pct}%`,
        level: pct < 50 ? "warn" : "info",
        context: { framework: "coverage" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    const allFilesMatch = line.match(ALL_FILES);
    if (allFilesMatch) {
      return {
        message: `Coverage: ${allFilesMatch[1]}%`,
        level: parseFloat(allFilesMatch[1]) < 50 ? "warn" : "info",
        context: { framework: "coverage" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    return null;
  },
};
