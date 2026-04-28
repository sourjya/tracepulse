/**
 * MCP tool handler for get_build_errors.
 *
 * Returns only build-error source events, deduplicated by fingerprint,
 * sorted by timestamp descending (most recent first).
 *
 * @see .kiro/specs/phase2-watch-mode/design.md for tool contract
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import { DEFAULT_BUILD_ERRORS_LIMIT } from "@/constants/watch.js";

/**
 * Handle get_build_errors MCP tool call.
 *
 * @param buffer - Event buffer to query.
 * @param args - Tool input: { limit?: number }.
 * @returns MCP CallToolResult with build errors.
 */
export function handleGetBuildErrors(
  buffer: EventBuffer,
  args: Record<string, unknown>,
): CallToolResult {
  const limit = (args.limit as number | undefined) ?? DEFAULT_BUILD_ERRORS_LIMIT;

  // Query all build-error events (buffer returns newest-first)
  const all = buffer.query({ source: "build-error" });
  const totalCount = all.length;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          errors: all.slice(0, limit),
          total_count: totalCount,
          oldest_event_at: buffer.oldestEventAt,
          buffer_cleared_at: buffer.bufferClearedAt,
          last_build_at: buffer.lastBuildAt,
        }),
      },
    ],
  };
}
