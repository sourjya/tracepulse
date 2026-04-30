/**
 * Celery background worker log parser.
 *
 * Parses Celery task lifecycle events: raised (error), succeeded, retry,
 * received, and timeout patterns. Extracts task name, ID, and error details.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

// Celery task error: Task <name>[<id>] raised <exception>
const TASK_RAISED = /Task\s+([\w.]+)\[([a-f0-9-]+)\]\s+raised\s+(.+)/i;
// Celery task retry: Task <name>[<id>] retry
const TASK_RETRY = /Task\s+([\w.]+)\[([a-f0-9-]+)\]\s+retry/i;
// Celery task timeout: TimeLimitExceeded or SoftTimeLimitExceeded
const TASK_TIMEOUT = /(?:Soft)?TimeLimitExceeded.*Task\s+([\w.]+)/i;
// Celery task succeeded (info level)
const TASK_SUCCEEDED = /Task\s+([\w.]+)\[([a-f0-9-]+)\]\s+succeeded/i;

/** Celery background worker parser. */
export const celeryParser: ErrorParser = {
  name: "celery",

  canParse(line: string): boolean {
    return TASK_RAISED.test(line) || TASK_RETRY.test(line) ||
           TASK_TIMEOUT.test(line) || TASK_SUCCEEDED.test(line);
  },

  parse(line: string): ParsedError | null {
    let match = TASK_RAISED.exec(line);
    if (match) {
      return {
        message: `Celery task ${match[1]} raised: ${match[3]}`,
        level: "error",
        context: {
          error_type: "CeleryTaskError",
          framework: "celery",
        },
        scoring_hints: { is_unhandled_exception: true },
      };
    }

    match = TASK_TIMEOUT.exec(line);
    if (match) {
      return {
        message: `Celery task ${match[1]} timed out`,
        level: "error",
        context: {
          error_type: "TimeLimitExceeded",
          framework: "celery",
        },
        scoring_hints: { is_unhandled_exception: true },
      };
    }

    match = TASK_RETRY.exec(line);
    if (match) {
      return {
        message: `Celery task ${match[1]} retrying`,
        level: "warn",
        context: {
          framework: "celery",
        },
        scoring_hints: {},
      };
    }

    match = TASK_SUCCEEDED.exec(line);
    if (match) {
      return {
        message: `Celery task ${match[1]} succeeded`,
        level: "info",
        context: {
          framework: "celery",
        },
        scoring_hints: {},
      };
    }

    return null;
  },
};
