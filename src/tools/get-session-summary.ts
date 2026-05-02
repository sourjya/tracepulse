/**
 * MCP tool handler for get_session_summary.
 *
 * Returns a ~200-token compressed manifest of the current session:
 * errors seen/acknowledged/pending, build status, tool usage, top error.
 * Designed to survive context compaction and replace ad-hoc re-investigation.
 *
 * @see .kiro/specs/m18-token-wave2/requirements.md W2.2
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { AuditBuffer } from "@/store/audit-buffer.js";

/**
 * Handle get_session_summary MCP tool call.
 *
 * Aggregates session state into a compact summary. Replaces 3-4
 * separate tool calls (get_errors + get_build_errors + get_health_summary)
 * with one ~200-token response.
 *
 * @param buffer - Event buffer with runtime errors.
 * @param auditBuffer - Audit trail with tool usage and acknowledged errors.
 * @returns Compact session summary.
 */
export function handleGetSessionSummary(
  buffer: EventBuffer,
  auditBuffer: AuditBuffer,
): CallToolResult {
  const allErrors = buffer.query({ level: "error" });
  const buildErrors = buffer.query({ source: "build-error" });
  const sessionMinutes = Math.round((Date.now() - buffer.sessionStartedAt) / 60000);

  // Count acknowledged vs pending
  const acknowledged = allErrors.filter((e) => auditBuffer.isAcknowledged(e.fingerprint)).length;
  const pending = allErrors.length - acknowledged;

  // Find top error by signal score
  const topError = allErrors.length > 0
    ? allErrors.sort((a, b) => b.signal_score - a.signal_score)[0]
    : null;

  // Build status
  const lastBuild = buffer.lastBuildAt;
  const buildStatus = buildErrors.length > 0 ? "errors" : (lastBuild ? "clean" : "no builds");

  // Overall status
  const status = pending === 0 && buildErrors.length === 0 ? "clean" : "issues";

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        status,
        errors: {
          total_seen: allErrors.length,
          acknowledged,
          pending,
          build_errors: buildErrors.length,
        },
        build: {
          status: buildStatus,
          last_build_at: lastBuild,
        },
        tools_called: auditBuffer.totalInvocations,
        session_minutes: sessionMinutes,
        top_error: topError
          ? `${topError.message.slice(0, 80)} (score ${topError.signal_score}, ${topError.occurrence_count}x)`
          : null,
      }),
    }],
  };
}
