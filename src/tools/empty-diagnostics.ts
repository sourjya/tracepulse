/**
 * Why-empty diagnostics for tool responses.
 *
 * When a tool returns empty results, include a diagnostics field
 * explaining why and what to do. Prevents tool abandonment.
 */

/** Diagnostic messages for empty tool responses. */
export const EMPTY_DIAGNOSTICS: Record<string, string> = {
  get_errors: "No errors in buffer. Either the server is running cleanly, or no log output has been received yet. Check get_runtime_status() to verify the server is connected.",
  get_build_errors: "No build errors. Either the build succeeded, or no build output has been received. Check last_build_at timestamp - if null, no build has run yet.",
  get_new_errors: "No new fingerprints. All errors in the buffer have been seen in previous sessions. This means no novel errors since the last session.",
  get_correlated_errors: "No correlations found. This usually means no frontend error source is configured. Use Chrome DevTools MCP list_console_messages() to check browser errors directly.",
  correlate_with_diff: "No correlations. Either no errors have context.file matching changed files, or there are no uncommitted git changes.",
  get_requests: "No HTTP requests matching the filter. The HTTP access log parser may not be matching your server's log format, or no requests have been made to the filtered path.",
  watch_for_errors: "No new errors during the watch window. Check total_events_seen - if 0, no log output was received at all (server may not be running). If > 0, the server is active but produced no errors.",
  get_infra_status: "No infrastructure services discovered. TracePulse scans .env files for service URLs (DATABASE_URL, REDIS_URL, etc.). If your .env uses different variable names, services won't be detected.",
};

/**
 * Add diagnostics to an empty response.
 */
export function addEmptyDiagnostics(
  toolName: string,
  response: Record<string, unknown>,
  isEmpty: boolean,
): Record<string, unknown> {
  if (!isEmpty) return response;
  const diagnostic = EMPTY_DIAGNOSTICS[toolName];
  if (!diagnostic) return response;
  return { ...response, diagnostics: diagnostic };
}
