/**
 * BullMQ background worker log parser.
 *
 * Parses BullMQ job lifecycle events: failed, completed, stalled,
 * and active patterns. Extracts job ID, queue name, and error details.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

// BullMQ job failed: Job <id> failed ... or [queue] Job <id> failed
const JOB_FAILED = /(?:\[(\w+)\]\s+)?Job\s+(\S+)\s+failed(?:\s+with\s+(.+))?/i;
// BullMQ job completed
const JOB_COMPLETED = /(?:\[(\w+)\]\s+)?Job\s+(\S+)\s+completed/i;
// BullMQ job stalled
const JOB_STALLED = /(?:\[(\w+)\]\s+)?Job\s+(\S+)\s+stalled/i;
// BullMQ error pattern
const BULLMQ_ERROR = /bull(?:mq)?\s*(?:error|ERR)/i;

/** BullMQ background worker parser. */
export const bullmqParser: ErrorParser = {
  name: "bullmq",

  canParse(line: string): boolean {
    return JOB_FAILED.test(line) || JOB_STALLED.test(line) ||
           JOB_COMPLETED.test(line) || BULLMQ_ERROR.test(line);
  },

  parse(line: string): ParsedError | null {
    let match = JOB_FAILED.exec(line);
    if (match) {
      const queue = match[1] ?? "default";
      return {
        message: `BullMQ job ${match[2]} failed${match[3] ? `: ${match[3]}` : ""} (queue: ${queue})`,
        level: "error",
        context: {
          error_type: "BullMQJobError",
          framework: "bullmq",
        },
        scoring_hints: { is_unhandled_exception: true },
      };
    }

    match = JOB_STALLED.exec(line);
    if (match) {
      return {
        message: `BullMQ job ${match[2]} stalled (queue: ${match[1] ?? "default"})`,
        level: "warn",
        context: {
          error_type: "BullMQJobStalled",
          framework: "bullmq",
        },
        scoring_hints: {},
      };
    }

    if (BULLMQ_ERROR.test(line)) {
      return {
        message: line.trim(),
        level: "error",
        context: {
          error_type: "BullMQError",
          framework: "bullmq",
        },
        scoring_hints: {},
      };
    }

    match = JOB_COMPLETED.exec(line);
    if (match) {
      return {
        message: `BullMQ job ${match[2]} completed (queue: ${match[1] ?? "default"})`,
        level: "info",
        context: {
          framework: "bullmq",
        },
        scoring_hints: {},
      };
    }

    return null;
  },
};
