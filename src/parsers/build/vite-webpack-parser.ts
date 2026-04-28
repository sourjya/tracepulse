/**
 * Vite/webpack build error parser for the TracePulse pipeline.
 *
 * Parses common build tool error formats:
 *   [vite] Internal server error: message
 *   [vite] Pre-transform error: message
 *   ERROR in ./path/to/file
 *   Module not found: Error: message
 *
 * @see src/types/parsers.ts for the ErrorParser interface
 * @see .kiro/specs/phase2-watch-mode/design.md for parser specifications
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** Matches Vite error lines: [vite] Internal server error: ... or [vite] Pre-transform error: ... */
const VITE_ERROR_PATTERN = /^\[vite\]\s+(?:Internal server error|Pre-transform error):\s*(.+)/i;

/** Matches webpack ERROR in ./path lines. Group 1 = file path. */
const WEBPACK_ERROR_IN_PATTERN = /^ERROR in\s+(.+)/;

/** Matches webpack Module not found lines. Group 1 = error message after "Error: ". */
const WEBPACK_MODULE_NOT_FOUND = /^Module not found:\s*Error:\s*(.+)/;

/**
 * Vite/webpack build error parser.
 *
 * Handles the most common error formats from both Vite and webpack.
 * Vite errors start with [vite], webpack errors start with "ERROR in"
 * or "Module not found".
 */
export const viteWebpackParser: ErrorParser = {
  name: "vite-webpack",

  canParse(line: string): boolean {
    return (
      VITE_ERROR_PATTERN.test(line) ||
      WEBPACK_ERROR_IN_PATTERN.test(line) ||
      WEBPACK_MODULE_NOT_FOUND.test(line)
    );
  },

  parse(line: string): ParsedError | null {
    /* Vite errors */
    const viteMatch = line.match(VITE_ERROR_PATTERN);
    if (viteMatch) {
      return {
        message: viteMatch[1],
        level: "error",
        context: { framework: "vite" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    /* webpack ERROR in ./file */
    const webpackErrorIn = line.match(WEBPACK_ERROR_IN_PATTERN);
    if (webpackErrorIn) {
      return {
        message: line,
        level: "error",
        context: { file: webpackErrorIn[1], framework: "webpack" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    /* webpack Module not found */
    const moduleNotFound = line.match(WEBPACK_MODULE_NOT_FOUND);
    if (moduleNotFound) {
      return {
        message: moduleNotFound[1],
        level: "error",
        context: { framework: "webpack" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    return null;
  },
};
