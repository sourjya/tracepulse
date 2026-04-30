/**
 * MCP tool handler for get_error_clusters.
 *
 * Groups errors by error_type + module directory, returning cluster
 * summaries instead of individual events. Helps agents see patterns
 * across related errors (e.g., "5 TypeErrors in src/api/").
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for tool contract
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { RuntimeEvent } from "@/types/events.js";
import * as path from "node:path";

/** A cluster of related errors grouped by type and module. */
interface ErrorCluster {
  readonly cluster_key: string;
  readonly error_type: string;
  readonly module_path: string;
  readonly count: number;
  readonly fingerprints: string[];
  readonly representative_message: string;
  readonly first_seen: number;
  readonly last_seen: number;
}

/**
 * Extract the directory portion of a file path for clustering.
 * Returns the first two path segments (e.g., "src/api") or "unknown"
 * if no file context is available.
 */
function getModulePath(event: RuntimeEvent): string {
  const file = event.context.file;
  if (!file) return "unknown";
  const dir = path.dirname(file);
  const parts = dir.split(path.sep).filter(Boolean);
  return parts.slice(0, 2).join("/") || "root";
}

/**
 * Handle get_error_clusters MCP tool call.
 *
 * Queries all error-level events, groups by (error_type, module_path),
 * and returns clusters sorted by count descending.
 *
 * @param buffer - Event buffer to query.
 * @param args - Tool input: { min_count?: number }.
 * @returns MCP CallToolResult with error clusters.
 */
export function handleGetErrorClusters(
  buffer: EventBuffer,
  args: Record<string, unknown>,
): CallToolResult {
  const minCount = (args.min_count as number | undefined) ?? 2;

  // Query all error-level events
  const errors = buffer.query({ level: "error" });

  // Group by (error_type, module_path)
  const clusterMap = new Map<string, {
    error_type: string;
    module_path: string;
    events: RuntimeEvent[];
  }>();

  for (const event of errors) {
    const errorType = event.context.error_type ?? "unknown";
    const modulePath = getModulePath(event);
    const key = `${errorType}|${modulePath}`;

    const existing = clusterMap.get(key);
    if (existing) {
      existing.events.push(event);
    } else {
      clusterMap.set(key, { error_type: errorType, module_path: modulePath, events: [event] });
    }
  }

  // Build cluster summaries, filter by min_count
  const clusters: ErrorCluster[] = [];
  for (const [key, group] of clusterMap) {
    if (group.events.length < minCount) continue;

    const sorted = group.events.sort((a, b) => a.timestamp - b.timestamp);
    clusters.push({
      cluster_key: key,
      error_type: group.error_type,
      module_path: group.module_path,
      count: group.events.length,
      fingerprints: [...new Set(group.events.map((e) => e.fingerprint))],
      representative_message: sorted[sorted.length - 1].message,
      first_seen: sorted[0].timestamp,
      last_seen: sorted[sorted.length - 1].timestamp,
    });
  }

  // Sort by count descending
  clusters.sort((a, b) => b.count - a.count);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          clusters,
          total_clusters: clusters.length,
          total_errors: errors.length,
        }),
      },
    ],
  };
}
