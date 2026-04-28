/**
 * Database migration output parser for TracePulse.
 *
 * Parses alembic and Django migration output into structured events.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** Alembic: Running upgrade abc123 -> def456, add users table */
const ALEMBIC_UPGRADE = /Running (upgrade|downgrade)\s+(\S+)\s*->\s*(\S+)/;

/** Alembic error */
const ALEMBIC_ERROR = /alembic.*error|migration.*failed|Can't locate revision/i;

/** Django: Applying auth.0001_initial... OK */
const DJANGO_APPLY = /Applying\s+(\S+)\.\.\.\s*(OK|FAKED)/;

/** Django migration error */
const DJANGO_MIGRATION_ERROR = /django\.db\.utils\.|migration.*error/i;

export const migrationParser: ErrorParser = {
  name: "migration",

  canParse(line: string): boolean {
    return ALEMBIC_UPGRADE.test(line) || ALEMBIC_ERROR.test(line) ||
           DJANGO_APPLY.test(line) || DJANGO_MIGRATION_ERROR.test(line);
  },

  parse(line: string): ParsedError | null {
    if (ALEMBIC_ERROR.test(line) || DJANGO_MIGRATION_ERROR.test(line)) {
      return {
        message: line.trim(),
        level: "error",
        context: { framework: line.includes("alembic") ? "alembic" : "django" },
        scoring_hints: { is_user_code: true, has_stack_trace: false },
      };
    }

    const alembicMatch = line.match(ALEMBIC_UPGRADE);
    if (alembicMatch) {
      return {
        message: `Migration ${alembicMatch[1]}: ${alembicMatch[2]} -> ${alembicMatch[3]}`,
        level: "info",
        context: { framework: "alembic" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    const djangoMatch = line.match(DJANGO_APPLY);
    if (djangoMatch) {
      return {
        message: `Migration applied: ${djangoMatch[1]} (${djangoMatch[2]})`,
        level: "info",
        context: { framework: "django" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    return null;
  },
};
