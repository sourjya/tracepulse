/**
 * MCP tool handler for get_new_errors.
 *
 * Returns only events with fingerprints not seen in previous sessions.
 *
 * @see src/persistence/fingerprint-history.ts for history manager
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { FingerprintHistory } from "@/persistence/fingerprint-history.js";

/**
 * Handle get_new_errors MCP tool call.
 *
 * @param buffer - Backend event buffer.
 * @param history - Fingerprint history manager.
 * @param args - Tool input: { since_session_start?: boolean, limit?: number }.
 * @returns MCP CallToolResult with novel errors.
 */
export function handleGetNewErrors(
  buffer: EventBuffer,
  history: FingerprintHistory,
  args: Record<string, unknown>,
): CallToolResult {
  const limit = (args.limit as number | undefined) ?? 10;

  // Get error/warn events
  const events = buffer.query({ level: "warn" });

  // Filter to only new fingerprints
  const novel = events.filter((e) => history.isNew(e.fingerprint));

  // Sort by signal_score descending, apply limit
  novel.sort((a, b) => b.signal_score - a.signal_score);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          errors: novel.slice(0, limit),
          total_new: novel.length,
        }),
      },
    ],
  };
}
