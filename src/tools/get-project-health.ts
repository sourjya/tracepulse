/**
 * MCP tool handler for get_project_health.
 *
 * Composite health check: server + infra + errors + build in one call.
 * Replaces 4+ separate tool calls with a single summary.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { InfraMonitor } from "@/infra/infra-monitor.js";

export function handleGetProjectHealth(
  buffer: EventBuffer,
  getConnected: () => boolean,
  infraMonitor: InfraMonitor | null,
): CallToolResult {
  const connected = getConnected();
  const errors = buffer.query({ level: "error" });
  const buildErrors = buffer.query({ source: "build-error" });
  const uptimeMin = Math.round((Date.now() - buffer.sessionStartedAt) / 60000);

  const infraSummary = infraMonitor?.getSummary() ?? "not configured";
  const infraServices = infraMonitor?.getAll() ?? [];
  const unreachable = infraServices.filter((s) => s.current.status !== "reachable");

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
        session_started_at: buffer.sessionStartedAt,
      }),
    }],
  };
}
