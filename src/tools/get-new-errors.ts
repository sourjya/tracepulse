/**
 * MCP tool handler for get_new_errors.
 *
 * Returns only events with fingerprints not seen in previous sessions.
 *
 * @see src/persistence/fingerprint-history.ts for history manager
 */

import { DEFAULT_NEW_ERRORS_LIMIT } from "@/constants/limits.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { FingerprintHistory } from "@/persistence/fingerprint-history.js";

/**
 * Handle get_new_errors MCP tool call.
 *
 * @param buffer - Backend event buffer.
 * @param history - Fingerprint history manager.
 * @param args - Tool input: { since?: number, limit?: number }.
 * @returns MCP CallToolResult with novel errors.
 */
export function handleGetNewErrors(
  buffer: EventBuffer,
  history: FingerprintHistory,
  args: Record<string, unknown>,
): CallToolResult {
  const limit = (args.limit as number | undefined) ?? DEFAULT_NEW_ERRORS_LIMIT;
  const since = args.since as number | undefined;

  // Get error/warn events, optionally bounded to a time window
  const events = buffer.query({ level: "warn", since });

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
          diagnostics: novel.length === 0
            ? events.length === 0
              ? "No errors in buffer. Server may be running cleanly or no log output received yet."
              : `No new fingerprints. All ${events.length} error(s) in buffer have been seen in previous sessions.`
            : undefined,
        }),
      },
    ],
  };
}
