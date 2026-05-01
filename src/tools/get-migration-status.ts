/**
 * MCP tool handler for get_migration_status.
 *
 * Auto-detects the migration framework from project files and runs the
 * appropriate status command via run_and_watch. Parses the output to
 * determine if migrations are pending.
 *
 * Supported frameworks: alembic, prisma, django, knex.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for tool contract
 */

import { MAX_PENDING_MIGRATIONS } from "@/constants/limits.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { existsSync } from "node:fs";

/** Migration framework detection result. */
interface DetectedFramework {
  readonly name: string;
  readonly command: string;
}

/** Get the command to apply pending migrations for a framework. */
function getApplyCommand(framework: string): string {
  const commands: Record<string, string> = {
    alembic: "alembic upgrade head",
    prisma: "npx prisma migrate deploy",
    django: "python manage.py migrate",
    knex: "npx knex migrate:latest",
  };
  return commands[framework] ?? `Unknown framework: ${framework}`;
}

/**
 * Detect migration framework from project files in cwd.
 *
 * @param cwd - Directory to scan for framework markers.
 * @returns Detected framework with its status command, or null if none found.
 */
function detectFramework(cwd: string): DetectedFramework | null {
  // Alembic (Python/SQLAlchemy)
  if (existsSync(`${cwd}/alembic.ini`) || existsSync(`${cwd}/alembic`)) {
    return { name: "alembic", command: "alembic current && alembic heads" };
  }
  // Prisma (Node.js)
  if (existsSync(`${cwd}/prisma/schema.prisma`)) {
    return { name: "prisma", command: "npx prisma migrate status" };
  }
  // Django
  if (existsSync(`${cwd}/manage.py`)) {
    return { name: "django", command: "python manage.py showmigrations --plan" };
  }
  // Knex (Node.js)
  if (existsSync(`${cwd}/knexfile.js`) || existsSync(`${cwd}/knexfile.ts`)) {
    return { name: "knex", command: "npx knex migrate:status" };
  }
  return null;
}

/**
 * Parse migration status output into structured result.
 *
 * @param framework - Which framework produced the output (alembic, prisma, django, knex).
 * @param output - Raw stdout from the migration status command.
 * @returns Structured status with pending count, suggestion, and raw output snippet.
 */
function parseMigrationOutput(framework: string, output: string): Record<string, unknown> {
  const lines = output.split("\n").filter(Boolean);

  if (framework === "prisma") {
    const pending = lines.filter((l) => l.includes("not yet applied") || l.includes("Following migration"));
    return {
      status: pending.length > 0 ? "behind" : "up-to-date",
      pending_count: pending.length,
      suggestion: pending.length > 0 ? "Run: npx prisma migrate deploy" : null,
      raw_output: output.slice(0, 500),
    };
  }

  if (framework === "django") {
    const unapplied = lines.filter((l) => l.includes("[ ]"));
    return {
      status: unapplied.length > 0 ? "behind" : "up-to-date",
      pending_count: unapplied.length,
      pending_migrations: unapplied.map((l) => l.trim()).slice(0, MAX_PENDING_MIGRATIONS),
      suggestion: unapplied.length > 0 ? "Run: python manage.py migrate" : null,
      raw_output: output.slice(0, 500),
    };
  }

  if (framework === "alembic") {
    const current = lines.find((l) => l.includes("(head)") || /^[a-f0-9]+/.test(l));
    const isHead = output.includes("(head)");
    return {
      status: isHead ? "up-to-date" : "behind",
      current_revision: current?.trim() ?? "unknown",
      suggestion: !isHead ? "Run: alembic upgrade head" : null,
      raw_output: output.slice(0, 500),
    };
  }

  // knex or unknown - return raw
  return {
    status: "unknown",
    suggestion: "Check migration status manually",
    raw_output: output.slice(0, 500),
  };
}

/**
 * Handle get_migration_status MCP tool call.
 *
 * @param args - Tool input: { framework?: string }.
 * @param cwd - Current working directory for framework detection.
 * @param runAndWatch - Function to execute commands (injected for testability).
 * @returns MCP CallToolResult with migration status.
 */
export function handleGetMigrationStatus(
  args: Record<string, unknown>,
  cwd: string,
  runAndWatch?: (command: string) => Promise<string>,
): CallToolResult | Promise<CallToolResult> {
  const requestedFramework = args.framework as string | undefined;
  const apply = args.apply === true;

  // Detect or use specified framework
  let framework: DetectedFramework | null;
  if (requestedFramework) {
    const commands: Record<string, string> = {
      alembic: "alembic current && alembic heads",
      prisma: "npx prisma migrate status",
      django: "python manage.py showmigrations --plan",
      knex: "npx knex migrate:status",
    };
    const cmd = commands[requestedFramework];
    if (!cmd) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: `Unknown framework: ${requestedFramework}. Supported: alembic, prisma, django, knex`,
        }) }],
      };
    }
    framework = { name: requestedFramework, command: cmd };
  } else {
    framework = detectFramework(cwd);
  }

  if (!framework) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        error: "No migration framework detected. Looked for: alembic.ini, prisma/schema.prisma, manage.py, knexfile.js",
        suggestion: "Specify framework explicitly: get_migration_status(framework: 'prisma')",
      }) }],
    };
  }

  // If no runAndWatch provided, return the command to run
  if (!runAndWatch) {
    const cmd = apply ? getApplyCommand(framework.name) : framework.command;
    return {
      content: [{ type: "text", text: JSON.stringify({
        framework: framework.name,
        command: cmd,
        suggestion: `Run: run_and_watch("${cmd}")`,
      }) }],
    };
  }

  // Execute: either check status or apply migrations
  const cmd = apply ? getApplyCommand(framework.name) : framework.command;
  return runAndWatch(cmd).then((output) => {
    const parsed = apply
      ? { status: "applied", raw_output: output.slice(0, 500) }
      : parseMigrationOutput(framework!.name, output);
    return {
      content: [{ type: "text", text: JSON.stringify({
        framework: framework!.name,
        action: apply ? "apply" : "status",
        ...parsed,
      }) }],
    };
  });
}
