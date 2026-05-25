/**
 * Positive reinforcement nudge for correct tool usage.
 *
 * Returns a short tip message on the FIRST successful use of a tool
 * per session, then stays silent. This establishes the habit without
 * burning repeat tokens on every subsequent call.
 *
 * @see src/analysis/shell-misuse.ts for the detection side (post-session)
 */

/** Tools that get a one-time positive nudge on first successful use. */
const NUDGE_MESSAGES: Record<string, string> = {
  run_and_watch: "✓ Structured results + fingerprinting. Keep using run_and_watch for all test/build/lint commands.",
  verify_build: "✓ Typecheck + build + runtime in one call. Better than separate shell commands.",
  verify_loop: "✓ Composite verification in one call. Saves 5-7 tool calls worth of tokens.",
};

/** Tracks which tools have already shown their nudge this session. */
const nudgedThisSession = new Set<string>();

/**
 * Get a one-time positive reinforcement tip for a tool.
 *
 * Returns the tip string on first successful call per session,
 * then returns null for all subsequent calls. Keeps token cost
 * to ~15 tokens total per session (not per call).
 *
 * @param tool - The tool name (e.g., "run_and_watch").
 * @returns Tip string or null if already shown this session.
 */
export function getPositiveNudge(tool: string): string | null {
  if (nudgedThisSession.has(tool)) return null;
  const msg = NUDGE_MESSAGES[tool];
  if (!msg) return null;
  nudgedThisSession.add(tool);
  return msg;
}

/**
 * Reset nudge state. Called on session reset (for testing).
 */
export function resetNudges(): void {
  nudgedThisSession.clear();
}
