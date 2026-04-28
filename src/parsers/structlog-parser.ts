/**
 * Structlog key-value format parser for TracePulse.
 *
 * Parses Python structlog's ConsoleRenderer output format:
 *   2026-04-28 10:00:00 [info     ] request completed    method=GET path=/api/users status=200
 *   2026-04-28 10:00:01 [warning  ] slow query           duration=1.5s query=SELECT...
 *   2026-04-28 10:00:02 [error    ] unhandled exception   exc_info=True
 *
 * The JSON renderer format is already handled by json-log-parser.ts.
 * This parser handles the human-readable key-value format used in development.
 *
 * @see src/parsers/json-log-parser.ts for JSON structlog format
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";
import type { LogLevel } from "@/types/events.js";

/**
 * Matches structlog ConsoleRenderer format:
 * Optional timestamp, then [level] in brackets, then event message, then key=value pairs.
 * Group 1: level (with possible trailing spaces)
 * Group 2: event message + key-value pairs
 */
const STRUCTLOG_PATTERN = /\[(\w+)\s*\]\s+(.+)/;

/** Map structlog level strings to TracePulse LogLevel. */
const LEVEL_MAP: Record<string, LogLevel> = {
  debug: "debug",
  info: "info",
  warning: "warn",
  warn: "warn",
  error: "error",
  critical: "error",
  fatal: "error",
};

/**
 * Structlog key-value format parser.
 *
 * Matches lines containing [level] brackets — the signature of structlog's
 * ConsoleRenderer. Extracts the log level and event message.
 */
export const structlogParser: ErrorParser = {
  name: "structlog",

  canParse(line: string): boolean {
    return STRUCTLOG_PATTERN.test(line);
  },

  parse(line: string): ParsedError | null {
    const match = line.match(STRUCTLOG_PATTERN);
    if (!match) return null;

    const [, rawLevel, rest] = match;
    const level = LEVEL_MAP[rawLevel.toLowerCase()] ?? "info";

    return {
      message: rest.trim(),
      level,
      context: {
        framework: "structlog",
      },
      scoring_hints: {
        is_user_code: level === "error",
        has_stack_trace: false,
      },
    };
  },
};
