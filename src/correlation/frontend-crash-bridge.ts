/**
 * Frontend crash bridge - accepts React ErrorBoundary crash reports
 * and converts them into RuntimeEvents in the main event buffer.
 *
 * This bridges the gap between frontend runtime errors (which TracePulse
 * can't see via stdout/stderr) and the agent's error visibility. The
 * frontend app POSTs crash data to the log collector's /api/v1/crashes
 * endpoint, and this module normalizes it into a RuntimeEvent.
 *
 * @see src/correlation/sources/log-collector.ts for the HTTP endpoint
 * @see docs/research/agent-feedback/agent-feedback-log.md for the motivation
 */

import type { RuntimeEvent } from "@/types/events.js";
import { fingerprint } from "@/pipeline/fingerprinter.js";

/** Payload from the frontend ErrorBoundary POST. */
export interface CrashReport {
  readonly message: string;
  readonly stack?: string;
  readonly componentStack?: string;
  readonly url?: string;
}

/**
 * Validate a crash report payload.
 *
 * @param payload - Raw parsed JSON from the POST body.
 * @returns Validated CrashReport or null if invalid.
 */
export function validateCrashReport(payload: Record<string, unknown>): CrashReport | null {
  const message = payload.message;
  if (!message || typeof message !== "string") return null;
  return {
    message: message.slice(0, 500),
    stack: typeof payload.stack === "string" ? payload.stack.slice(0, 2000) : undefined,
    componentStack: typeof payload.componentStack === "string" ? payload.componentStack.slice(0, 1000) : undefined,
    url: typeof payload.url === "string" ? payload.url.slice(0, 500) : undefined,
  };
}

/**
 * Convert a crash report into a RuntimeEvent for the main buffer.
 *
 * Extracts file:line from the stack trace if available. Sets source
 * to 'server-stderr' so it appears in get_errors alongside backend errors.
 * Signal score is high (70+) because frontend crashes are user-visible.
 *
 * @param report - Validated crash report.
 * @returns RuntimeEvent ready to push into the ring buffer.
 */
export function crashReportToEvent(report: CrashReport): RuntimeEvent {
  // Extract file:line from first non-node_modules stack frame
  let file: string | undefined;
  let line: number | undefined;
  if (report.stack) {
    const frames = report.stack.split("\n");
    for (const frame of frames) {
      const match = frame.match(/at\s+.*?\(?((?:\/|\.)[^:)]+):(\d+)/);
      if (match && !match[1].includes("node_modules")) {
        file = match[1];
        line = parseInt(match[2], 10);
        break;
      }
    }
  }

  // Extract error type from message (e.g., "TypeError: Cannot read...")
  const errorTypeMatch = report.message.match(/^(\w+Error):/);
  const errorType = errorTypeMatch ? errorTypeMatch[1] : "FrontendCrash";

  const fp = fingerprint("frontend-crash", report.message, file, line);

  return {
    timestamp: Date.now(),
    id: crypto.randomUUID(),
    source: "server-stderr",
    service: "frontend",
    level: "error",
    message: `[Frontend] ${report.message}`,
    raw: report.stack ?? report.message,
    fingerprint: fp,
    signal_score: 75,
    signal_strength: "high",
    occurrence_count: 1,
    first_seen: Date.now(),
    context: {
      error_type: errorType,
      framework: "react",
      ...(file ? { file } : {}),
      ...(line ? { line } : {}),
    },
  };
}
