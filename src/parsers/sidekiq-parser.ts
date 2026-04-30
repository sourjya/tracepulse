/**
 * Sidekiq background worker log parser.
 *
 * Parses Sidekiq job lifecycle events from its standard log format.
 * Extracts job class, JID, error details, and timing.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

// Sidekiq error: WARN: <class> JID-<id> ... or ERROR: <class>
const SIDEKIQ_FAIL = /(?:WARN|ERROR|FATAL):\s*([\w:]+)(?:\s+JID-([a-f0-9]+))?\s+(.+)/i;
// Sidekiq done: <class> JID-<id> done: <duration>
const SIDEKIQ_DONE = /([\w:]+)\s+JID-([a-f0-9]+)\s+done:\s*([\d.]+)/i;
// Sidekiq start: <class> JID-<id> start
const SIDEKIQ_START = /([\w:]+)\s+JID-([a-f0-9]+)\s+start/i;

/** Sidekiq background worker parser. */
export const sidekiqParser: ErrorParser = {
  name: "sidekiq",

  canParse(line: string): boolean {
    return (line.includes("JID-") && (line.includes("done:") || line.includes("start") || line.includes("WARN") || line.includes("ERROR") || line.includes("FATAL"))) ||
           SIDEKIQ_FAIL.test(line);
  },

  parse(line: string): ParsedError | null {
    let match = SIDEKIQ_FAIL.exec(line);
    if (match && /WARN|ERROR|FATAL/.test(line)) {
      const level = line.includes("FATAL") || line.includes("ERROR") ? "error" as const : "warn" as const;
      return {
        message: `Sidekiq ${match[1]}: ${match[3]}`,
        level,
        context: {
          error_type: "SidekiqJobError",
          framework: "sidekiq",
        },
        scoring_hints: { is_unhandled_exception: level === "error" },
      };
    }

    match = SIDEKIQ_DONE.exec(line);
    if (match) {
      return {
        message: `Sidekiq ${match[1]} done in ${match[3]}s`,
        level: "info",
        context: {
          framework: "sidekiq",
        },
        scoring_hints: {},
      };
    }

    return null;
  },
};
