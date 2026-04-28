/**
 * MCP tool handler for get_timeline.
 *
 * Returns a unified chronological stream of ALL events in a time window.
 * Includes window metadata and a capped flag.
 *
 * @see src/query/timeline-query.ts for the query logic
 * @see .kiro/specs/phase2-watch-mode/design.md for tool contract
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import { queryTimeline } from "@/query/timeline-query.js";
import { DEFAULT_TIMELINE_LIMIT, MAX_TIMELINE_LIMIT } from "@/constants/watch.js";

/**
 * Handle get_timeline MCP tool call.
 *
 * @param buffer - Event buffer to query.
 * @param args - Tool input: { since: number, duration_seconds?: number, limit?: number }.
 * @returns MCP CallToolResult with timeline events and metadata.
 */
export function handleGetTimeline(
  buffer: EventBuffer,
  args: Record<string, unknown>,
): CallToolResult {
  const since = args.since as number | undefined;

  if (since === undefined) {
    return {
      content: [{ type: "text", text: "since parameter is required" }],
      isError: true,
    };
  }

  const durationSeconds = args.duration_seconds as number | undefined;
  const requestedLimit = (args.limit as number | undefined) ?? DEFAULT_TIMELINE_LIMIT;
  const limit = Math.min(requestedLimit, MAX_TIMELINE_LIMIT);

  // Get all events in window (no limit) to compute total_in_window
  const allInWindow = queryTimeline(buffer, since, durationSeconds);
  const totalInWindow = allInWindow.length;
  const capped = totalInWindow > limit;
  const events = allInWindow.slice(0, limit);

  const end = durationSeconds !== undefined ? since + durationSeconds * 1000 : Date.now();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          events,
          window: { from: since, to: end },
          total_in_window: totalInWindow,
          capped,
        }),
      },
    ],
  };
}
