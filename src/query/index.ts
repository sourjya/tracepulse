/**
 * Query module barrel export.
 *
 * Re-exports timeline query functions for use by MCP tool handlers.
 *
 * @see src/query/timeline-query.ts
 */

export { queryTimeline, querySurroundingLogs, countOccurrences } from "./timeline-query.js";
