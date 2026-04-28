/**
 * MCP tool handler for get_error_trends.
 *
 * Returns cross-session frequency and history for a specific fingerprint.
 *
 * @see src/persistence/fingerprint-history.ts for history manager
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { FingerprintHistory } from "@/persistence/fingerprint-history.js";

/**
 * Handle get_error_trends MCP tool call.
 *
 * @param history - Fingerprint history manager.
 * @param args - Tool input: { fingerprint: string }.
 * @returns MCP CallToolResult with trend data.
 */
export function handleGetErrorTrends(
  history: FingerprintHistory,
  args: Record<string, unknown>,
): CallToolResult {
  const fingerprint = args.fingerprint as string | undefined;

  if (!fingerprint) {
    return {
      content: [{ type: "text", text: "fingerprint parameter is required" }],
      isError: true,
    };
  }

  const record = history.getRecord(fingerprint);
  if (!record) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: null,
            message: `No history found for fingerprint: ${fingerprint}`,
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          fingerprint: record.fingerprint,
          first_seen: record.first_seen,
          last_seen: record.last_seen,
          total_occurrences: record.total_occurrences,
        }),
      },
    ],
  };
}
