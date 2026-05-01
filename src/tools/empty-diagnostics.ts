/**
 * Why-empty diagnostics and cross-tool routing hints for tool responses.
 *
 * When a tool returns empty results, include a diagnostics field explaining
 * why and a suggested_next array pointing to the right tool in the three-layer
 * stack (TracePulse, Chrome DevTools MCP, ViewGraph).
 *
 * Prevents tool abandonment and guides the agent to the correct layer.
 *
 * @see docs/engineering/designs/viewgraph-handover.md for routing design
 */

/** Diagnostic message + routing hints for empty tool responses. */
interface EmptyDiagnostic {
  readonly message: string;
  readonly suggested_next?: readonly string[];
}

/** Diagnostic messages and routing hints for each tool. */
const EMPTY_DIAGNOSTICS: Record<string, EmptyDiagnostic> = {
  get_errors: {
    message: "No errors in buffer. Server is running cleanly, or no log output received yet.",
    suggested_next: [
      "get_runtime_status() - verify server is connected",
      "Chrome DevTools MCP: list_console_messages(types: ['error']) - check browser errors",
      "ViewGraph: request_capture() - inspect the DOM for visual issues",
    ],
  },
  get_build_errors: {
    message: "No build errors. Build succeeded or no build output received. Check last_build_at.",
  },
  get_new_errors: {
    message: "No new fingerprints. All errors have been seen in previous sessions.",
  },
  get_correlated_errors: {
    message: "No correlations found. No frontend error source configured.",
    suggested_next: [
      "Chrome DevTools MCP: list_network_requests(resourceTypes: ['fetch', 'xhr']) - find failed requests",
      "get_errors(message_contains: '/api/path') - search backend logs for the endpoint",
    ],
  },
  correlate_with_diff: {
    message: "No correlations. No errors match changed files, or no uncommitted git changes.",
  },
  get_requests: {
    message: "No HTTP requests matching filter. Server may use a different log format, or no requests made.",
  },
  watch_for_errors: {
    message: "No new errors during watch window. Check total_events_seen - if 0, server may not be running.",
    suggested_next: [
      "Chrome DevTools MCP: list_console_messages(types: ['error']) - check browser-side errors",
      "Chrome DevTools MCP: list_network_requests() - check for failed API calls",
    ],
  },
  get_infra_status: {
    message: "No infrastructure services discovered. TracePulse scans .env for DATABASE_URL, REDIS_URL, etc.",
  },
  get_error_clusters: {
    message: "No error clusters found. Either zero errors or all errors are unique (no patterns).",
  },
};

/**
 * Add diagnostics and routing hints to an empty response.
 *
 * @param toolName - Name of the tool that returned empty.
 * @param response - The original response object.
 * @param isEmpty - Whether the response is empty (no results).
 * @returns Response with diagnostics and suggested_next fields added if empty.
 */
export function addEmptyDiagnostics(
  toolName: string,
  response: Record<string, unknown>,
  isEmpty: boolean,
): Record<string, unknown> {
  if (!isEmpty) return response;
  const diagnostic = EMPTY_DIAGNOSTICS[toolName];
  if (!diagnostic) return response;
  return {
    ...response,
    diagnostics: diagnostic.message,
    ...(diagnostic.suggested_next ? { suggested_next: diagnostic.suggested_next } : {}),
  };
}
