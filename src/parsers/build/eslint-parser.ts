/**
 * ESLint output parser for the TracePulse pipeline.
 *
 * Parses ESLint's default formatter output format:
 *   <leading-whitespace>line:col  error|warning  message  rule-name
 *
 * Each indented line is a separate lint finding. The file path comes from
 * a preceding non-indented header line, but this parser handles individual
 * finding lines — the pipeline provides file context separately.
 *
 * @see src/types/parsers.ts for the ErrorParser interface
 * @see .kiro/specs/phase2-watch-mode/design.md for parser specifications
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/**
 * Matches ESLint finding lines with leading whitespace:
 *   "  10:5  error  message text  rule-name"
 * Groups: 1=line, 2=col, 3=severity, 4=message, 5=rule-name
 */
const ESLINT_LINE_PATTERN =
  /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/;

/**
 * ESLint output parser.
 *
 * Handles individual ESLint finding lines (indented with line:col).
 * Does not handle the file header line — that's a plain path without
 * the indented pattern.
 */
export const eslintParser: ErrorParser = {
  name: "eslint",

  canParse(line: string): boolean {
    return ESLINT_LINE_PATTERN.test(line);
  },

  parse(line: string): ParsedError | null {
    const match = line.match(ESLINT_LINE_PATTERN);
    if (!match) return null;

    const [, lineStr, colStr, severity, message, ruleName] = match;

    return {
      message,
      level: severity === "warning" ? "warn" : "error",
      context: {
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        error_type: ruleName,
        framework: "eslint",
      },
      scoring_hints: {
        is_user_code: true,
        has_stack_trace: false,
      },
    };
  },
};
