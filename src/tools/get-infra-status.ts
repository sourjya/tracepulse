/**
 * MCP tool handlers for infrastructure status.
 *
 * get_infra_status: summary of all discovered services (cheap, ~100 tokens)
 * get_infra_detail: per-service detail with history (on demand, ~200 tokens)
 */

import { MAX_TRUNCATED_LIST } from "@/constants/limits.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { errorResult } from "@/mcp/response-helpers.js";
import type { InfraMonitor } from "@/infra/infra-monitor.js";
import { redact } from "@/pipeline/secret-redactor.js";

/**
 * Handle get_infra_status - summary of all services.
 */
export function handleGetInfraStatus(monitor: InfraMonitor): CallToolResult {
  const all = monitor.getAll();

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        summary: monitor.getSummary(),
        services: all.map((s) => ({
          name: s.service.name,
          host: s.service.host,
          port: s.service.port,
          status: s.current.status,
          latency_ms: s.current.latency_ms,
          error: s.current.error,
          source: s.service.source,
        })),
        service_count: all.length,
        last_probed_at: all.length > 0 ? Math.max(...all.map((s) => s.current.checked_at)) : null,
      }),
    }],
  };
}

/**
 * Handle get_infra_detail - per-service detail with history.
 */
export function handleGetInfraDetail(
  monitor: InfraMonitor,
  args: Record<string, unknown>,
): CallToolResult {
  const name = args.name as string | undefined;
  if (!name) {
    return errorResult("name parameter is required");
  }

  const svc = monitor.getByName(name);
  if (!svc) {
    const available = monitor.getAll().map((s) => s.service.name).join(", ");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: `Service "${name}" not found. Available: ${available || "none discovered"}`,
        }),
      }],
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        name: svc.service.name,
        host: svc.service.host,
        port: svc.service.port,
        protocol: svc.service.protocol,
        status: svc.current.status,
        latency_ms: svc.current.latency_ms,
        error: svc.current.error,
        source: svc.service.source,
        history: svc.history.slice(0, MAX_TRUNCATED_LIST),
      }),
    }],
  };
}
