/**
 * Shell misuse detection patterns.
 *
 * Defines command patterns that should go through run_and_watch instead of shell.
 * Used by the shell misuse analyzer in get_session_insights to flag when agents
 * bypass TracePulse's structured output pipeline.
 *
 * @see src/analysis/shell-misuse.ts for the detection logic
 * @see docs/ideas/shell-misuse-detection.md for the feature rationale
 */

/**
 * Command prefixes/patterns that produce pass/fail output and should use run_and_watch.
 * Each entry is matched against the start of the command string (after trimming).
 */
export const SHELL_MISUSE_PATTERNS: readonly RegExp[] = [
  // Test runners
  /^(npx\s+)?(vitest|jest|mocha)/,
  /^(python\s+-m\s+)?pytest/,
  /^cargo\s+test/,
  /^go\s+test/,
  /^(mvn|maven)\s+test/,
  /^gradle\s+test/,
  /^npm\s+(run\s+)?test/,
  /^pnpm\s+(run\s+)?test/,
  /^bun\s+test/,

  // Type checkers
  /^(npx\s+)?tsc(\s|$)/,
  /^(python\s+-m\s+)?mypy/,

  // Linters
  /^(npx\s+)?eslint/,
  /^(python\s+-m\s+)?ruff\s+(check|format)/,
  /^(python\s+-m\s+)?pylint/,
  /^(npx\s+)?prettier\s+--check/,
  /^cargo\s+clippy/,

  // Build commands
  /^npm\s+run\s+build/,
  /^pnpm\s+(run\s+)?build/,
  /^(npx\s+)?(vite|tsup|esbuild)\s+build/,
  /^(npx\s+)?vite\s+build/,
  /^uv\s+build/,
  /^cargo\s+build/,
  /^go\s+build/,
  /^(mvn|maven)\s+(package|compile|install)/,
  /^gradle\s+(build|assemble)/,
  /^docker\s+(compose\s+)?build/,
];

/**
 * Patterns that indicate output truncation — a sign the agent is losing data.
 * Matched anywhere in the command string.
 */
export const OUTPUT_TRUNCATION_PATTERNS: readonly RegExp[] = [
  /\|\s*tail/,
  /\|\s*head/,
  /\|\s*grep/,
  /2>&1\s*\|\s*tail/,
];
