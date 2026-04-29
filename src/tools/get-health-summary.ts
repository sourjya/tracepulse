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
  const allErrors = buffer.query({ level: "error" });
  const errorCount = allErrors.length;
  const warnCount = buffer.query({ level: "warn" }).length - errorCount;
  const totalEvents = buffer.size;
  const uptimeMs = Date.now() - buffer.sessionStartedAt;
  const uptimeMin = Math.round(uptimeMs / 60000);

  // Count errors since last clear as "new"
  const baseline = buffer.bufferClearedAt ?? buffer.sessionStartedAt;
  const newErrors = allErrors.filter((e) => e.timestamp > baseline).length;
  const oldErrors = errorCount - newErrors;

  const summary = connected
    ? `${errorCount} errors (${newErrors} new, ${oldErrors} pre-existing), ${warnCount} warnings, uptime ${uptimeMin}min`
    : `DISCONNECTED - ${errorCount} errors before disconnect`;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          summary,
          connected,
          error_count: errorCount,
          new_errors: newErrors,
          old_errors: oldErrors,
          warning_count: warnCount,
          total_events: totalEvents,
          uptime_minutes: uptimeMin,
          session_started_at: buffer.sessionStartedAt,
        }),
      },
    ],
  };
}
