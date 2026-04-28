/**
 * MCP tool handler for get_health_summary.
 *
 * One-line health check combining status, error count, and request rate.
 * Replaces 3 separate tool calls with 1.
 *
 * @see src/mcp/server.ts for registration
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";

/**
 * Handle get_health_summary MCP tool call.
 *
 * @param buffer - Event buffer to query.
 * @param getConnected - Connection status callback.
 * @returns One-line health summary.
 */
export function handleGetHealthSummary(
  buffer: EventBuffer,
  getConnected: () => boolean,
): CallToolResult {
  const connected = getConnected();
  const errorCount = buffer.query({ level: "error" }).length;
  const warnCount = buffer.query({ level: "warn" }).length;
  const totalEvents = buffer.size;
  const uptimeMs = Date.now() - buffer.sessionStartedAt;
  const uptimeMin = Math.round(uptimeMs / 60000);

  const summary = connected
    ? `${errorCount} errors, ${warnCount} warnings, ${totalEvents} total events, uptime ${uptimeMin}min`
    : `DISCONNECTED - ${errorCount} errors before disconnect`;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          summary,
          connected,
          error_count: errorCount,
          warning_count: warnCount,
          total_events: totalEvents,
          uptime_minutes: uptimeMin,
          session_started_at: buffer.sessionStartedAt,
        }),
      },
    ],
  };
}
