/**
 * Severity classifier for RuntimeEvents.
 *
 * Classifies events into crash/error/warning/info based on message patterns,
 * log level, and context. Used by get_new_errors and notification dispatcher.
 *
 * @see .kiro/specs/phase5-proactive/design.md for classification rules
 */

import type { RuntimeEvent } from "@/types/events.js";

/** Severity levels from most to least severe. */
export type Severity = "crash" | "error" | "warning" | "info";

/** Classification rule: pattern + resulting severity. */
interface ClassificationRule {
  readonly severity: Severity;
  readonly test: (event: RuntimeEvent) => boolean;
}

/** Crash patterns in error messages. */
const CRASH_PATTERNS = [
  /process exit(ed)? with code [1-9]/i,
  /uncaught exception/i,
  /unhandled (promise )?rejection/i,
  /SIG(KILL|SEGV|ABRT|BUS)/i,
  /fatal error/i,
  /out of memory/i,
];

/** HTTP 5xx pattern. */
const HTTP_5XX = /\bHTTP\s*5\d{2}\b|\b5\d{2}\s+(Internal|Bad Gateway|Service Unavailable)/i;

/**
 * Ordered classification rules - first match wins.
 * Crash rules are checked before error rules, etc.
 */
const RULES: readonly ClassificationRule[] = [
  // Crash: process exit, unhandled exceptions, fatal signals
  {
    severity: "crash",
    test: (e) => CRASH_PATTERNS.some((p) => p.test(e.message) || p.test(e.raw)),
  },
  // Error: HTTP 5xx or error-level log
  {
    severity: "error",
    test: (e) => HTTP_5XX.test(e.message) || e.level === "error",
  },
  // Warning: warn-level log
  {
    severity: "warning",
    test: (e) => e.level === "warn",
  },
];

/**
 * Classify a RuntimeEvent's severity.
 *
 * Applies rules in priority order (crash > error > warning > info).
 * Returns "info" as the default fallback.
 *
 * @param event - The event to classify.
 * @returns Severity level.
 */
export function classifySeverity(event: RuntimeEvent): Severity {
  for (const rule of RULES) {
    if (rule.test(event)) return rule.severity;
  }
  return "info";
}
