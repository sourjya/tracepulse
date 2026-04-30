/**
 * MCP tool handler for get_error_context.
 *
 * Deep-dive into a specific error by fingerprint. Returns the full error,
 * surrounding log events (±5 seconds), and total occurrence count.
 *
 * @see src/query/timeline-query.ts for surrounding log and occurrence queries
 * @see .kiro/specs/phase2-watch-mode/design.md for tool contract
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import { querySurroundingLogs, countOccurrences } from "@/query/timeline-query.js";
import { ERROR_CONTEXT_WINDOW_MS, MAX_SURROUNDING_LOGS } from "@/constants/watch.js";
import { findNarrative } from "@/scoring/error-narratives.js";

/**
 * Handle get_error_context MCP tool call.
 *
 * @param buffer - Event buffer to query.
 * @param args - Tool input: { fingerprint: string }.
 * @returns MCP CallToolResult with error context or not-found message.
 */
export function handleGetErrorContext(
  buffer: EventBuffer,
  args: Record<string, unknown>,
): CallToolResult {
  const fingerprint = args.fingerprint as string | undefined;

  if (!fingerprint) {
    return {
      content: [{ type: "text", text: "fingerprint parameter is required" }],
      isError: true,
    };
  }

  // Find the most recent event with this fingerprint
  const all = buffer.query({});
  const error = all.find((e) => e.fingerprint === fingerprint) ?? null;

  if (!error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: null,
            surrounding_logs: [],
            occurrence_count: 0,
            message: `No error found with fingerprint: ${fingerprint}`,
          }),
        },
      ],
    };
  }

  const surroundingLogs = querySurroundingLogs(
    buffer,
    error,
    ERROR_CONTEXT_WINDOW_MS,
    MAX_SURROUNDING_LOGS,
  );
  const occurrenceCount = countOccurrences(buffer, fingerprint);
  const narrative = findNarrative(error.message);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error,
          surrounding_logs: surroundingLogs,
          occurrence_count: occurrenceCount,
          ...(narrative ? { fix_suggestion: narrative } : {}),
        }),
      },
    ],
  };
}
