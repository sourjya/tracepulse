/**
 * Response compression utilities for token savings.
 *
 * Provides stack frame filtering and error message abbreviation
 * to reduce response payload sizes. Applied in the response path
 * (not in the buffer) so full data is preserved for deep investigation.
 *
 * @see .kiro/specs/m17-token-wave1/requirements.md W1.3, W1.4
 */

// ──────────────────────────────────────────────
// Stack Frame Filtering (W1.3)
// ──────────────────────────────────────────────

/** Framework path patterns to strip from stack traces. */
const FRAMEWORK_PATTERNS = [
  /^\s*at\s+.*node_modules\/.*/,
  /^\s*at\s+.*node:internal\/.*/,
  /^\s*at\s+.*\(node:.*/,
  /^File ".*site-packages\/.*/,
  /^File ".*\.cargo\/registry\/.*/,
  /^\s*at\s+(?:java|javax|sun|jdk\.internal)\..*/,
  /^\s*at\s+.*processTicksAndRejections.*/,
];

/**
 * Strip framework/library frames from a stack trace, keeping only user code.
 *
 * @param stack - Full stack trace string with newlines.
 * @returns Stack trace with only user-code frames.
 */
export function filterFrameworkFrames(stack: string): string {
  const lines = stack.split("\n");
  const filtered = lines.filter((line) =>
    !FRAMEWORK_PATTERNS.some((p) => p.test(line)),
  );
  return filtered.join("\n");
}

// ──────────────────────────────────────────────
// Message Abbreviation (W1.4)
// ──────────────────────────────────────────────

/** Abbreviation patterns: [match regex, replacement function]. */
const ABBREVIATIONS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  // TypeError: Cannot read properties of null (reading 'name') -> null.name TypeError
  [/TypeError: Cannot read properties of (\w+) \(reading '(\w+)'\)/, (m) => `${m[1]}.${m[2]} TypeError`],
  // TypeError: X is not a function -> X() TypeError
  [/TypeError: (\w+) is not a function/, (m) => `${m[1]}() TypeError`],
  // ReferenceError: X is not defined -> X undefined
  [/ReferenceError: (\w+) is not defined/, (m) => `${m[1]} undefined`],
  // ModuleNotFoundError: No module named 'X' -> missing: X
  [/ModuleNotFoundError: No module named '(\S+)'/, (m) => `missing: ${m[1]}`],
  // Cannot find module 'X' -> missing: X
  [/Cannot find module '(\S+)'/, (m) => `missing: ${m[1]}`],
  // ECONNREFUSED 127.0.0.1:PORT -> PORT refused
  [/ECONNREFUSED\s+[\d.]+:(\d+)/, (m) => `port ${m[1]} refused`],
  // column "X" does not exist -> missing col: X
  [/column "?(\w+)"? does not exist/, (m) => `missing col: ${m[1]}`],
  // relation "X" does not exist -> missing table: X
  [/relation "(\w+)" does not exist/, (m) => `missing table: ${m[1]}`],
  // EADDRINUSE :::PORT -> port PORT in use
  [/EADDRINUSE.*:(\d+)/, (m) => `port ${m[1]} in use`],
  // SyntaxError: Unexpected token X -> syntax: unexpected X
  [/SyntaxError: Unexpected token (\S+)/, (m) => `syntax: unexpected ${m[1]}`],
];

/**
 * Abbreviate a common error message to a shorter form.
 * Returns the original message if no abbreviation pattern matches.
 *
 * @param message - Full error message.
 * @returns Abbreviated message or original if no match.
 */
export function abbreviateMessage(message: string): string {
  for (const [pattern, replacer] of ABBREVIATIONS) {
    const match = message.match(pattern);
    if (match) return replacer(match);
  }
  return message;
}
