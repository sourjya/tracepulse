/**
 * MCP tool handler for get_audit_trail.
 *
 * Returns recent MCP tool invocations with timing and token estimates.
 * Helps agents understand their own usage patterns and optimize.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for tool contract
 */

import { DEFAULT_AUDIT_TRAIL_LIMIT } from "@/constants/limits.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuditBuffer } from "@/store/audit-buffer.js";

/**
 * Handle get_audit_trail MCP tool call.
 *
 * @param auditBuffer - Audit buffer to query.
 * @param args - Tool input: { limit?: number, since?: number }.
 * @returns MCP CallToolResult with audit records.
 */
export function handleGetAuditTrail(
  auditBuffer: AuditBuffer,
  args: Record<string, unknown>,
): CallToolResult {
  const limit = (args.limit as number | undefined) ?? DEFAULT_AUDIT_TRAIL_LIMIT;
  const since = args.since as number | undefined;

  const records = auditBuffer.query(limit, since);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          actions: records,
          total_session_invocations: auditBuffer.totalInvocations,
          showing: records.length,
        }),
      },
    ],
  };
}
