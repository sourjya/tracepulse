/**
 * MCP tool handler for get_project_health.
 *
 * Composite health check: server + infra + errors + build in one call.
 * Replaces 4+ separate tool calls with a single summary.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { InfraMonitor } from "@/infra/infra-monitor.js";
import type { PatternAnalyzer } from "@/analysis/pattern-analyzer.js";
import { existsSync } from "node:fs";

/** Detect migration framework from project files. */
function detectMigrationFramework(cwd: string): string | null {
  if (existsSync(`${cwd}/alembic.ini`) || existsSync(`${cwd}/alembic`)) return "alembic";
  if (existsSync(`${cwd}/prisma/schema.prisma`)) return "prisma";
  if (existsSync(`${cwd}/manage.py`)) return "django";
  if (existsSync(`${cwd}/knexfile.js`) || existsSync(`${cwd}/knexfile.ts`)) return "knex";
  return null;
}

export function handleGetProjectHealth(
  buffer: EventBuffer,
  getConnected: () => boolean,
  infraMonitor: InfraMonitor | null,
  cwd?: string,
  patternAnalyzer?: PatternAnalyzer,
): CallToolResult {
  const connected = getConnected();
  const errors = buffer.query({ level: "error" });
  const buildErrors = buffer.query({ source: "build-error" });
  const uptimeMin = Math.round((Date.now() - buffer.sessionStartedAt) / 60000);

  const infraSummary = infraMonitor?.getSummary() ?? "not configured";
  const infraServices = infraMonitor?.getAll() ?? [];
  const unreachable = infraServices.filter((s) => s.current.status !== "reachable");

  // Detect migration framework from project files
  const migrationFramework = cwd ? detectMigrationFramework(cwd) : null;

  const issues: string[] = [];
  if (!connected) issues.push("Server is DISCONNECTED");
  if (errors.length > 0) issues.push(`${errors.length} runtime error(s)`);
  if (buildErrors.length > 0) issues.push(`${buildErrors.length} build error(s)`);
  if (unreachable.length > 0) issues.push(`${unreachable.length} unreachable service(s): ${unreachable.map((s) => s.service.name).join(", ")}`);

  const healthy = issues.length === 0 && connected;

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        healthy,
        summary: healthy
          ? `All clear: server running, ${infraSummary}, 0 errors, uptime ${uptimeMin}min`
          : `Issues: ${issues.join("; ")}`,
        server: { connected, uptime_minutes: uptimeMin },
        errors: { runtime: errors.length, build: buildErrors.length },
        infrastructure: {
          summary: infraSummary,
          unreachable: unreachable.map((s) => ({ name: s.service.name, error: s.current.error })),
        },
        ...(migrationFramework ? { migrations: { framework: migrationFramework, hint: `Use get_migration_status() to check pending migrations` } } : {}),
        ...(patternAnalyzer ? (() => {
          const analysis = patternAnalyzer.analyze();
          const count = analysis.recurring.length + analysis.velocity.length + analysis.chains.length + analysis.flaky.length + analysis.fixed_but_back.length;
          return count > 0 ? { pattern_alert: `${count} bug pattern(s) detected. Call get_bug_patterns() for details.` } : {};
        })() : {}),
        session_started_at: buffer.sessionStartedAt,
      }),
    }],
  };
}
