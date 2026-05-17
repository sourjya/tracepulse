/**
 * npm audit output parser for TracePulse.
 *
 * Parses npm audit summary lines into structured events.
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** "6 vulnerabilities (2 critical, 1 high, 3 moderate)" */
const AUDIT_SUMMARY = /(\d+)\s+vulnerabilit(?:y|ies)\s*\(([^)]+)\)/i;

/** "found 0 vulnerabilities" */
const AUDIT_CLEAN = /found\s+0\s+vulnerabilities/i;

export const npmAuditParser: ErrorParser = {
  name: "npm-audit",

  canParse(line: string): boolean {
    return AUDIT_SUMMARY.test(line) || AUDIT_CLEAN.test(line);
  },

  parse(line: string): ParsedError | null {
    if (AUDIT_CLEAN.test(line)) {
      return {
        message: "npm audit: 0 vulnerabilities",
        level: "info",
        context: { framework: "npm-audit" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    const match = line.match(AUDIT_SUMMARY);
    if (match) {
      const hasCritical = /critical/i.test(match[2]);
      const hasHigh = /high/i.test(match[2]);

      return {
        message: `npm audit: ${match[0]}`,
        level: hasCritical || hasHigh ? "error" : "warn",
        context: { framework: "npm-audit", error_type: hasCritical ? "critical" : hasHigh ? "high" : "moderate" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    return null;
  },
};
