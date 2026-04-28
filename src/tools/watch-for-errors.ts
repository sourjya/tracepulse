/**
 * MCP tool handler for watch_for_errors.
 *
 * Blocks for N seconds, collecting new error/warn events from the buffer.
 * Delegates to the watch controller and formats the result as an MCP response.
 *
 * @see src/watch/watch-controller.ts for the blocking logic
 * @see .kiro/specs/phase2-watch-mode/design.md for tool contract
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { EventSource } from "@/types/events.js";
import { watchForErrors } from "@/watch/watch-controller.js";
import { DEFAULT_WATCH_DURATION_SECONDS } from "@/constants/watch.js";

/**
 * Handle watch_for_errors MCP tool call.
 *
 * @param buffer - Event buffer to watch.
 * @param args - Tool input: { duration_seconds?: number, source?: string }.
 * @returns MCP CallToolResult with watch results or error.
 */
export async function handleWatchForErrors(
  buffer: EventBuffer,
  args: Record<string, unknown>,
  isAttachMode?: boolean,
): Promise<CallToolResult> {
  const duration =
    (args.duration_seconds as number | undefined) ?? DEFAULT_WATCH_DURATION_SECONDS;
  const source = args.source as EventSource | undefined;

  try {
    const result = await watchForErrors(buffer, duration, source, isAttachMode);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: err instanceof Error ? err.message : String(err),
        },
      ],
      isError: true,
    };
  }
}
