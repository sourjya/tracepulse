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
import { filterDebouncedErrors } from "@/pipeline/debounce-filter.js";

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
  const debounce = args.debounce === true; // opt-in, not default
  const includeWarnings = args.include_warnings !== false; // default true

  // Query build-error events (errors)
  const all = buffer.query({ source: "build-error" });
  const filtered = debounce ? filterDebouncedErrors(all) : all;

  // Also include warn-level build events if requested
  const warnings = includeWarnings
    ? buffer.query({ source: "build-error", level: "warn" })
        .filter((e) => e.level === "warn" && !filtered.some((f) => f.fingerprint === e.fingerprint))
    : [];

  // Get latest build stats (modules transformed, build time) from info events
  const buildStats = buffer.query({ level: "info" })
    .filter((e) => e.message.startsWith("Build:") || e.message.startsWith("Build completed"))
    .slice(0, 2);

  const totalCount = filtered.length;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          errors: filtered.slice(0, limit),
          warnings: warnings.slice(0, 5),
          total_count: totalCount,
          warning_count: warnings.length,
          ...(buildStats.length > 0 ? { build_stats: buildStats.map((e) => e.message) } : {}),
          oldest_event_at: buffer.oldestEventAt,
          buffer_cleared_at: buffer.bufferClearedAt,
          last_build_at: buffer.lastBuildAt,
        }),
      },
    ],
  };
}
