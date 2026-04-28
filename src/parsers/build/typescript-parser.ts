/**
 * TypeScript compiler error parser for the TracePulse pipeline.
 *
 * Parses the standard `tsc` output format:
 *   file(line,col): error TS####: message
 *   file(line,col): warning TS####: message
 *
 * Extracts file path, line, column, error code, and message into a ParsedError.
 * Build errors receive high signal scoring since they block the dev server.
 *
 * @see src/types/parsers.ts for the ErrorParser interface
 * @see .kiro/specs/phase2-watch-mode/design.md for parser specifications
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/**
 * Matches tsc output: file(line,col): error|warning TS####: message
 * Groups: 1=file, 2=line, 3=col, 4=severity, 5=TS code, 6=message
 */
const TS_ERROR_PATTERN =
  /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

/**
 * TypeScript compiler error parser.
 *
 * Handles single-line tsc errors/warnings. Multi-line continuation
 * (type mismatch details) is captured in the raw line but not parsed
 * into separate fields — the message from the first line is sufficient
 * for agent triage.
 */
export const typescriptParser: ErrorParser = {
  name: "typescript",

  canParse(line: string): boolean {
    return TS_ERROR_PATTERN.test(line);
  },

  parse(line: string): ParsedError | null {
    const match = line.match(TS_ERROR_PATTERN);
    if (!match) return null;

    const [, file, lineStr, colStr, severity, tsCode, message] = match;

    return {
      message,
      level: severity === "warning" ? "warn" : "error",
      context: {
        file,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        error_type: tsCode,
        framework: "typescript",
      },
      scoring_hints: {
        is_user_code: true,
        has_stack_trace: false,
      },
    };
  },
};
