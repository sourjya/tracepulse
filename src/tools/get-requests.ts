/**
 * MCP tool handler for get_requests.
 *
 * Returns recent HTTP requests parsed from access logs, filtered by path.
 * Answers: "show me the last 5 requests to /export with status and timing."
 */

import { DEFAULT_QUERY_LIMIT } from "@/constants/limits.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";

/**
 * Handle get_requests MCP tool call.
 *
 * Queries the buffer for HTTP access log events (those with context.http_status),
 * optionally filtered by path substring.
 *
 * @param buffer - Event buffer.
 * @param args - { path?: string, limit?: number, status_code_min?: number }.
 */
export function handleGetRequests(
  buffer: EventBuffer,
  args: Record<string, unknown>,
): CallToolResult {
  const pathFilter = args.path as string | undefined;
  const limit = (args.limit as number | undefined) ?? DEFAULT_QUERY_LIMIT;
  const statusMin = args.status_code_min as number | undefined;

  // Get all events that have http_status (i.e., parsed from access logs)
  const all = buffer.query({});
  const requests = all.filter((e) => {
    if (!e.context.http_status) return false;
    if (pathFilter && !e.message.toLowerCase().includes(pathFilter.toLowerCase())) return false;
    if (statusMin && e.context.http_status < statusMin) return false;
    return true;
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        requests: requests.slice(0, limit).map((e) => ({
          method: e.message.split(" ")[0],
          path: e.context.file,
          status: e.context.http_status,
          message: e.message,
          timestamp: e.timestamp,
          signal_score: e.signal_score,
        })),
        total: requests.length,
      }),
    }],
  };
}
