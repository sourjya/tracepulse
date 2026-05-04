/**
 * Tool layer definitions for dynamic activation.
 *
 * Defines which tools belong to each capability layer:
 * - Layer 0: Always available (filesystem tools)
 * - Layer 2: Require a running server (error monitoring tools)
 * - Layer 3: Require persistence history (pattern tools)
 *
 * Layer 1 (project detection) doesn't affect tool availability -
 * it affects allowlists and suggestions.
 *
 * @see .kiro/specs/m21-zero-config/requirements.md
 */

/**
 * Tools that require a running server (Layer 2).
 * These are disabled in standalone mode until start_server succeeds.
 */
export const LAYER_2_TOOLS: readonly string[] = [
  "get_errors",
  "get_server_logs",
  "watch_for_errors",
  "get_build_errors",
  "verify_fix",
  "get_error_context",
  "get_timeline",
  "get_correlated_errors",
  "list_services",
  "restart_server",
  "stop_server",
  "wait_for_build",
  "wait_for_event",
  "get_requests",
  "get_perf_baseline",
  "get_error_clusters",
];

/** Set for O(1) lookup. */
const LAYER_2_SET = new Set(LAYER_2_TOOLS);

/**
 * Get a helpful hint for a Layer 2 tool called without a server.
 *
 * @param toolName - The tool being called.
 * @returns Hint string, or null if the tool is not Layer 2.
 */
export function getLayerHint(toolName: string): string | null {
  if (!LAYER_2_SET.has(toolName)) return null;
  return `"${toolName}" requires a running server. Call start_server({ command: "your dev server" }) first, or use get_project_health() to see suggested commands.`;
}
