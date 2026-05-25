/**
 * Shell misuse detector for get_session_insights.
 *
 * Scans the audit trail for shell tool calls where the command matches
 * known test/build/lint patterns that should go through run_and_watch.
 * Returns structured violations so the agent gets actionable feedback.
 *
 * This is the runtime enforcement counterpart to steering-file rules.
 * Steering files tell the agent what to do; this module tells it what
 * it did wrong after the fact.
 *
 * @see src/constants/shell-misuse.ts for the pattern definitions
 * @see src/analysis/usage-nudge.ts for the complementary "never used run_and_watch" nudge
 */

import type { AuditRecord } from "@/store/audit-buffer.js";
import { SHELL_MISUSE_PATTERNS, OUTPUT_TRUNCATION_PATTERNS } from "@/constants/shell-misuse.js";

/** A single shell misuse violation. */
export interface ShellMisuseViolation {
  /** The command that was run via shell. */
  readonly command: string;
  /** Timestamp of the shell call. */
  readonly timestamp: number;
  /** Whether the command also truncated output (piped to tail/head/grep). */
  readonly truncated_output: boolean;
}

/** Result of shell misuse analysis. */
export interface ShellMisuseResult {
  /** Number of shell calls that should have used run_and_watch. */
  readonly count: number;
  /** Individual violations (capped at 5 for token efficiency). */
  readonly violations: readonly ShellMisuseViolation[];
  /** Human-readable recommendation if violations found. */
  readonly recommendation: string | null;
}

/** Maximum violations to include in the response (token budget). */
const MAX_VIOLATIONS = 5;

/**
 * Detect shell calls that should have used run_and_watch.
 *
 * Scans audit records for tool === "shell" entries where params.command
 * matches known test/build/lint patterns. Returns a structured result
 * with violation details and a recommendation.
 *
 * @param entries - Audit trail entries from the current session.
 * @returns ShellMisuseResult with count, violations, and recommendation.
 */
export function detectShellMisuse(entries: readonly AuditRecord[]): ShellMisuseResult {
  const violations: ShellMisuseViolation[] = [];

  for (const entry of entries) {
    if (entry.tool !== "shell") continue;

    const command = extractCommand(entry.params);
    if (!command) continue;

    const trimmed = command.trim();
    const isTestBuildLint = SHELL_MISUSE_PATTERNS.some((p) => p.test(trimmed));
    if (!isTestBuildLint) continue;

    const truncated = OUTPUT_TRUNCATION_PATTERNS.some((p) => p.test(command));
    violations.push({ command: trimmed.slice(0, 120), timestamp: entry.timestamp, truncated_output: truncated });
  }

  const recommendation = violations.length > 0
    ? `${violations.length} shell call(s) should have used run_and_watch. Shell bypasses structured parsing, fingerprinting, and cross-session tracking. Use run_and_watch(command, cwd?) for tests, builds, and linters.`
    : null;

  return {
    count: violations.length,
    violations: violations.slice(0, MAX_VIOLATIONS),
    recommendation,
  };
}

/**
 * Extract the command string from shell tool params.
 *
 * Shell params can have the command as `command` or `args` depending
 * on the MCP client. Handles both cases.
 */
function extractCommand(params: Record<string, unknown>): string | null {
  if (typeof params.command === "string") return params.command;
  if (typeof params.args === "string") return params.args;
  return null;
}
