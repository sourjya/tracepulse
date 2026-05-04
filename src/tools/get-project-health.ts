/**
 * MCP tool handler for get_project_health.
 *
 * Composite health check: server + infra + errors + build in one call.
 * Layer-aware: adapts response based on what's available (M21).
 * When no server is running, suggests start commands from project files.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { InfraMonitor } from "@/infra/infra-monitor.js";
import type { PatternAnalyzer } from "@/analysis/pattern-analyzer.js";
import { detectProjectStacks, suggestStartCommands, detectMigrationFramework } from "@/diagnostics/project-detector.js";
import { existsSync } from "node:fs";

/**
 * Handle get_project_health tool call.
 *
 * Returns layer-aware health status. When no server is running (Layer 0/1),
 * includes detected stacks and suggested start commands so the agent knows
 * what to do next.
 *
 * @param buffer - Event buffer.
 * @param getConnected - Whether a server process is connected.
 * @param infraMonitor - Infrastructure monitor (may be null).
 * @param cwd - Project working directory.
 * @param patternAnalyzer - Pattern analyzer for cross-session alerts.
 */
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
  const projectDir = cwd ?? process.cwd();

  const infraSummary = infraMonitor?.getSummary() ?? "not configured";
  const infraServices = infraMonitor?.getAll() ?? [];
  const unreachable = infraServices.filter((s) => s.current.status !== "reachable");

  const migrationFramework = detectMigrationFramework(projectDir);

  // M21: Detect capability layers
  const stacks = detectProjectStacks(projectDir);
  const hasHistory = existsSync(`${projectDir}/.tracepulse`);

  const layers = {
    filesystem: true,
    project: stacks.length > 0,
    server: connected,
    history: hasHistory,
  };

  const issues: string[] = [];
  if (!connected) issues.push("Server is DISCONNECTED - call start_server() to begin monitoring, or use run_and_watch for one-off commands.");
  if (errors.length > 0) issues.push(`${errors.length} runtime error(s)`);
  if (buildErrors.length > 0) issues.push(`${buildErrors.length} build error(s)`);
  if (unreachable.length > 0) issues.push(`${unreachable.length} unreachable service(s): ${unreachable.map((s) => s.service.name).join(", ")}`);

  const healthy = issues.length === 0 && connected;

  // Build server status - layer-aware
  const serverStatus = connected
    ? { connected: true, uptime_minutes: uptimeMin }
    : (() => {
        const suggestions = suggestStartCommands(projectDir);
        return {
          status: "not_started" as const,
          ...(suggestions.length > 0 ? {
          suggestions: suggestions.map(s => ({
              command: `start_server({ command: "${s.command}" })`,
              reason: s.reason,
              confidence: s.confidence,
            })),
          } : {
            hint: "No start command detected. Call start_server({ command: 'your dev server command' }) to begin monitoring.",
          }),
        };
      })();

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        healthy,
        layers,
        summary: healthy
          ? `All clear: server running, ${infraSummary}, 0 errors, uptime ${uptimeMin}min`
          : connected
            ? `Issues: ${issues.join("; ")}`
            : `Layer 0+1 active (${stacks.length} stack(s) detected). ${issues.join("; ")}`,
        ...(stacks.length > 0 ? { stacks_detected: stacks.map(s => s.name) } : {}),
        server: serverStatus,
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
