/**
 * Monorepo output prefix parser.
 *
 * Turborepo and Nx prefix each stdout/stderr line with the package name:
 *   api:  Error: Cannot find module 'express'
 *   web:  [vite] Build error
 *   @myorg/api:  Server started
 *
 * This module extracts the package name and strips the prefix so
 * downstream parsers see clean input. The package name is used to
 * tag events with the originating service in multi-process mode.
 *
 * @see .kiro/specs/m16-platform-coverage/requirements.md R5
 */

/** Result of prefix parsing. */
export interface PrefixResult {
  /** Extracted package/service name. */
  readonly package: string;
  /** Line with prefix stripped. */
  readonly line: string;
}

/**
 * Monorepo prefix pattern.
 *
 * Matches: "packagename: " or "@scope/name: " at the start of a line.
 * The package name must be a valid npm package name (letters, digits, @, /, -, _).
 * Requires at least one space after the colon to distinguish from URLs and timestamps.
 *
 * Excludes:
 * - Timestamps like "12:34:56" (digits-only before colon)
 * - URLs like "http://..." (known protocol prefixes)
 * - Log levels like "INFO:" (all-caps single word)
 */
const PREFIX_RE = /^(@?[a-z][\w./-]*): {1,4}(.+)/;

/** Prefixes to exclude (URLs, log levels). */
const EXCLUDED_PREFIXES = new Set([
  "http", "https", "ftp", "file", "ws", "wss",
  "INFO", "WARN", "ERROR", "DEBUG", "FATAL", "TRACE",
  "info", "warn", "error", "debug",
]);

/**
 * Parse a monorepo output prefix from a log line.
 *
 * @param line - Raw log line from stdout/stderr.
 * @returns PrefixResult with package name and stripped line, or null if no prefix.
 */
export function parseMonorepoPrefix(line: string): PrefixResult | null {
  if (!line || line.length < 3) return null;

  const match = line.match(PREFIX_RE);
  if (!match) return null;

  const pkg = match[1];
  const rest = match[2].trim();

  // Exclude known non-package prefixes
  if (EXCLUDED_PREFIXES.has(pkg)) return null;

  // Exclude digit-only prefixes (timestamps like "12:34:56")
  if (/^\d+$/.test(pkg)) return null;

  return { package: pkg, line: rest };
}
