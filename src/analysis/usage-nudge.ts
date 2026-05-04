/**
 * Usage nudge detector for run_and_watch adoption.
 *
 * Analyzes the audit trail to detect when an agent has been active
 * (many tool calls) but never used run_and_watch or verify_build.
 * Returns a nudge message to inject into get_session_insights or
 * get_errors responses.
 *
 * Motivation: agents default to shell for test/build commands even
 * when run_and_watch provides structured output. This nudge puts
 * the reminder in the agent's workflow instead of relying on SKILL.md.
 *
 * @see docs/feedback/agent-feedback-log.md for the pattern
 */

import type { AuditRecord } from "@/store/audit-buffer.js";

/** Minimum tool calls before we consider nudging. */
const MIN_CALLS_FOR_NUDGE = 8;

/** Tools that count as "running commands through TP". */
const COMMAND_TOOLS = new Set(["run_and_watch", "verify_build"]);

/**
 * Detect if the agent should be nudged to use run_and_watch.
 *
 * Returns a nudge message if the agent has made 8+ tool calls but
 * never used run_and_watch or verify_build. Returns null if the
 * agent is already using command tools or hasn't made enough calls.
 *
 * @param entries - Audit trail entries from the current session.
 * @returns Nudge message string, or null if no nudge needed.
 */
export function detectRunAndWatchGap(entries: readonly AuditRecord[]): string | null {
  if (entries.length < MIN_CALLS_FOR_NUDGE) return null;

  const usedCommandTool = entries.some(e => COMMAND_TOOLS.has(e.tool));
  if (usedCommandTool) return null;

  return "Tip: use run_and_watch instead of shell for tests, builds, and linters. It returns structured pass/fail with parsed errors - no log reading needed.";
}
