/**
 * Error narrative patterns - pre-formatted fix suggestions for common errors.
 *
 * Maps error patterns to actionable fix suggestions that agents can
 * present directly. Each narrative includes the likely cause and a
 * concrete command or code change to resolve it.
 *
 * Wired into get_error_context to enrich error responses with suggestions.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for error narrative design
 */

/** A fix suggestion for a matched error pattern. */
export interface ErrorNarrative {
  readonly pattern_name: string;
  readonly likely_cause: string;
  readonly suggestion: string;
  readonly command?: string;
}

/** Pattern matcher: regex + narrative generator. */
interface NarrativePattern {
  readonly name: string;
  readonly test: RegExp;
  readonly narrative: (match: RegExpMatchArray) => ErrorNarrative;
}

/**
 * Error narrative patterns ordered by specificity.
 * More specific patterns come first to avoid generic matches.
 */
const NARRATIVE_PATTERNS: readonly NarrativePattern[] = [
  // Python: ModuleNotFoundError
  {
    name: "python-module-not-found",
    test: /ModuleNotFoundError: No module named '(\S+)'/,
    narrative: (m) => ({
      pattern_name: "python-module-not-found",
      likely_cause: `Python package '${m[1]}' is not installed in the active environment.`,
      suggestion: `Install the missing package.`,
      command: `pip install ${m[1]}`,
    }),
  },
  // Node.js: Cannot find module
  {
    name: "node-module-not-found",
    test: /Cannot find module '(\S+)'/,
    narrative: (m) => ({
      pattern_name: "node-module-not-found",
      likely_cause: `Node.js package '${m[1]}' is not installed or the path is wrong.`,
      suggestion: m[1].startsWith(".") ? `Check the import path - the file may not exist.` : `Install the missing package.`,
      command: m[1].startsWith(".") ? undefined : `npm install ${m[1]}`,
    }),
  },
  // PostgreSQL: connection refused
  {
    name: "postgres-connection-refused",
    test: /ECONNREFUSED.*(?::5432|postgres)/i,
    narrative: () => ({
      pattern_name: "postgres-connection-refused",
      likely_cause: "PostgreSQL is not running or not accepting connections on port 5432.",
      suggestion: "Start PostgreSQL.",
      command: "brew services start postgresql || sudo systemctl start postgresql",
    }),
  },
  // Redis: connection refused
  {
    name: "redis-connection-refused",
    test: /ECONNREFUSED.*(?::6379|redis)/i,
    narrative: () => ({
      pattern_name: "redis-connection-refused",
      likely_cause: "Redis is not running or not accepting connections on port 6379.",
      suggestion: "Start Redis.",
      command: "brew services start redis || sudo systemctl start redis",
    }),
  },
  // Database: relation/table does not exist - matches PostgreSQL, MySQL, and SQLite
  // PostgreSQL: relation "users" does not exist
  // MySQL: Table 'mydb.users' doesn't exist
  // SQLite: no such table: users
  {
    name: "relation-does-not-exist",
    test: /relation "(\S+)" does not exist|Table '(\S+)' doesn't exist|no such table: (\S+)/i,
    narrative: (m) => ({
      pattern_name: "relation-does-not-exist",
      likely_cause: `Database table '${m[1] || m[2] || m[3]}' does not exist. Migrations may be pending.`,
      suggestion: "Run pending database migrations.",
      command: "alembic upgrade head || npx prisma migrate deploy || python manage.py migrate",
    }),
  },
  // Database: column does not exist - matches PostgreSQL, MySQL, and SQLite variants
  // PostgreSQL: column "auth_provider" does not exist
  // PostgreSQL: column users.auth_provider of relation
  // Captures the column name from either quoted or dotted notation
  {
    name: "column-does-not-exist",
    test: /column (?:"?(\S+)"?\.)?"?(\S+)"? (?:does not exist|of relation)/i,
    narrative: (m) => ({
      pattern_name: "column-does-not-exist",
      likely_cause: `Column '${m[2] || m[1]}' does not exist. A migration may be pending.`,
      suggestion: "Run pending database migrations.",
      command: "alembic upgrade head || npx prisma migrate deploy || python manage.py migrate",
    }),
  },
  // Port already in use
  {
    name: "port-in-use",
    test: /EADDRINUSE.*:(\d+)|address already in use.*:(\d+)/i,
    narrative: (m) => ({
      pattern_name: "port-in-use",
      likely_cause: `Port ${m[1] || m[2]} is already in use by another process.`,
      suggestion: `Kill the process using port ${m[1] || m[2]} or use a different port.`,
      command: `lsof -i :${m[1] || m[2]} | grep LISTEN`,
    }),
  },
  // Permission denied
  {
    name: "permission-denied",
    test: /EACCES|Permission denied|PermissionError/i,
    narrative: () => ({
      pattern_name: "permission-denied",
      likely_cause: "The process does not have permission to access a file or resource.",
      suggestion: "Check file permissions. Avoid running as root - fix ownership instead.",
    }),
  },
  // Out of memory
  {
    name: "out-of-memory",
    test: /ENOMEM|JavaScript heap out of memory|MemoryError/i,
    narrative: () => ({
      pattern_name: "out-of-memory",
      likely_cause: "The process ran out of memory.",
      suggestion: "Increase Node.js heap size or reduce memory usage.",
      command: "NODE_OPTIONS='--max-old-space-size=4096'",
    }),
  },
  // TypeScript: type error
  {
    name: "typescript-type-error",
    test: /TS(\d+):\s*(.+)/,
    narrative: (m) => ({
      pattern_name: "typescript-type-error",
      likely_cause: `TypeScript compiler error TS${m[1]}: ${m[2]}`,
      suggestion: "Fix the type error in the indicated file and line.",
    }),
  },
];

/**
 * Find a fix suggestion for the given error message.
 *
 * Tries each narrative pattern in order. Returns the first match,
 * or null if no pattern matches.
 *
 * @param message - Error message to match against.
 * @returns ErrorNarrative with fix suggestion, or null.
 */
export function findNarrative(message: string): ErrorNarrative | null {
  for (const pattern of NARRATIVE_PATTERNS) {
    const match = pattern.test.exec(message);
    if (match) {
      return pattern.narrative(match);
    }
  }
  return null;
}
