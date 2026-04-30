/**
 * MCP tool handler for get_perf_baseline.
 *
 * Returns per-endpoint response time percentiles (P50, P95, max)
 * computed from HTTP access log events. Helps agents detect
 * performance regressions.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for tool contract
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PerfBaseline } from "@/store/perf-baseline.js";

/**
 * Handle get_perf_baseline MCP tool call.
 *
 * @param perfBaseline - Performance baseline tracker.
 * @param args - Tool input: { path?: string, limit?: number }.
 * @returns MCP CallToolResult with endpoint metrics.
 */
export function handleGetPerfBaseline(
  perfBaseline: PerfBaseline,
  args: Record<string, unknown>,
): CallToolResult {
  const path = args.path as string | undefined;
  const limit = (args.limit as number | undefined) ?? 20;

  if (path) {
    const metrics = perfBaseline.getByPath(path);
    if (!metrics) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: `No data for path: ${path}`,
          suggestion: "Make some requests to this endpoint first, then check again.",
        }) }],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ endpoints: [metrics] }) }],
    };
  }

  const endpoints = perfBaseline.getAll(limit);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          endpoints,
          total_tracked: endpoints.length,
        }),
      },
    ],
  };
}
