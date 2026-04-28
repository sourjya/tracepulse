/**
 * MCP server configuration and tool handler functions for TracePulse.
 *
 * Creates an McpServer with four tools (get_errors, get_server_logs,
 * get_runtime_status, clear_errors) that read from an EventBuffer.
 * Each tool handler is a pure function exported for direct testing.
 * The server uses stdio transport for MCP protocol communication.
 *
 * @see src/types/collectors.ts for the EventBuffer interface
 * @see src/constants/limits.ts for default query limits
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { EventBuffer } from "@/types/collectors.js";
import { validateEventFilters } from "@/types/events.js";
import { DEFAULT_ERROR_LIMIT, DEFAULT_LOG_LIMIT } from "@/constants/limits.js";
import { VERSION } from "@/index.js";
import { handleWatchForErrors } from "@/tools/watch-for-errors.js";
import { handleGetBuildErrors } from "@/tools/get-build-errors.js";
import { handleGetErrorContext } from "@/tools/get-error-context.js";
import { handleGetTimeline } from "@/tools/get-timeline.js";
import { correlateEvents } from "@/correlation/correlation-engine.js";
import { CORRELATION_WINDOW_MS } from "@/constants/services.js";
import { handleListServices } from "@/tools/list-services.js";
import { handleGetCorrelatedErrors } from "@/tools/get-correlated-errors.js";
import { handleGetNewErrors } from "@/tools/get-new-errors.js";
import { handleGetErrorTrends } from "@/tools/get-error-trends.js";
import { handleCorrelateWithDiff } from "@/tools/correlate-with-diff.js";
import { handleGetHealthSummary } from "@/tools/get-health-summary.js";
import { handleVerifyFix } from "@/tools/verify-fix.js";
import type { ServiceRegistry } from "@/services/service-registry.js";
import type { FrontendErrorBuffer } from "@/correlation/frontend-error-buffer.js";
import type { FingerprintHistory } from "@/persistence/fingerprint-history.js";

export type { CallToolResult };

// ──────────────────────────────────────────────
// Response Helpers
// ──────────────────────────────────────────────

/**
 * Wrap a JSON-serializable value in a successful CallToolResult.
 * All tool handlers return a single text content block with JSON.
 */
function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

/**
 * Wrap an error message in a CallToolResult with isError flag.
 * Returned when MCP tool input validation fails.
 */
function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ──────────────────────────────────────────────
// Tool Handlers (pure functions)
// ──────────────────────────────────────────────

/**
 * Handle get_errors tool - returns recent error/warn events sorted by signal_score descending.
 *
 * Filters the buffer for events with level 'error' or 'warn', validates
 * input params via validateEventFilters, and sorts by signal_score (highest first).
 * Default limit is DEFAULT_ERROR_LIMIT (20).
 *
 * @param buffer - The event buffer to query.
 * @param args - Untrusted MCP tool input: { since?: number, source?: string, limit?: number }.
 * @returns CallToolResult with JSON array of RuntimeEvents, or error result on invalid params.
 */
export function handleGetErrors(
  buffer: EventBuffer,
  args: Record<string, unknown>,
): CallToolResult {
  const validation = validateEventFilters(args);
  if (!validation.valid) {
    return errorResult(validation.error!);
  }

  const limit = (args.limit as number | undefined) ?? DEFAULT_ERROR_LIMIT;

  // Query with level='warn' to get both error and warn events
  const events = buffer.query({
    since: args.since as number | undefined,
    source: args.source as import("@/types/events.js").EventSource | undefined,
    level: "warn",
    message_contains: args.message_contains as string | undefined,
    status_code_min: args.status_code_min as number | undefined,
  });

  // Filter by service if provided
  const serviceFilter = args.service as string | undefined;
  const filtered = serviceFilter
    ? events.filter((e) => e.service === serviceFilter)
    : events;

  // Sort by signal_score descending (highest first), then apply limit
  filtered.sort((a, b) => b.signal_score - a.signal_score);
  const limited = filtered.slice(0, limit);

  // Run cross-service correlation on results
  const correlated = correlateEvents(limited, CORRELATION_WINDOW_MS);
  // Re-sort by signal_score after correlation (correlation sorts by timestamp)
  correlated.sort((a, b) => b.signal_score - a.signal_score);

  return jsonResult({
    errors: correlated,
    total_matching: filtered.length,
    session_started_at: buffer.sessionStartedAt,
    oldest_event_at: buffer.oldestEventAt,
    buffer_cleared_at: buffer.bufferClearedAt,
    last_event_timestamp: correlated.length > 0 ? correlated[0].timestamp : null,
  });
}

/**
 * Handle get_server_logs tool - returns recent log events at any severity, sorted by timestamp descending.
 *
 * Accepts an optional minimum level filter. Default limit is DEFAULT_LOG_LIMIT (50).
 * Results are sorted newest-first (timestamp descending) by the buffer's query method.
 *
 * @param buffer - The event buffer to query.
 * @param args - Untrusted MCP tool input: { level?: string, since?: number, limit?: number }.
 * @returns CallToolResult with JSON array of RuntimeEvents, or error result on invalid params.
 */
export function handleGetServerLogs(
  buffer: EventBuffer,
  args: Record<string, unknown>,
): CallToolResult {
  const validation = validateEventFilters(args);
  if (!validation.valid) {
    return errorResult(validation.error!);
  }

  const limit = (args.limit as number | undefined) ?? DEFAULT_LOG_LIMIT;

  const events = buffer.query({
    since: args.since as number | undefined,
    level: args.level as import("@/types/events.js").LogLevel | undefined,
    limit,
    message_contains: args.message_contains as string | undefined,
    status_code_min: args.status_code_min as number | undefined,
  });

  return jsonResult(events);
}

/**
 * Handle get_runtime_status tool - quick health check returning connection state and error summary.
 *
 * Counts error-level events and finds the most recent error timestamp.
 * No input params - reads directly from the buffer and connection state callback.
 *
 * @param buffer - The event buffer to query.
 * @param getConnected - Callback returning whether the child process is connected.
 * @returns CallToolResult with JSON { connected, error_count, last_error_time }.
 */
export function handleGetRuntimeStatus(
  buffer: EventBuffer,
  getConnected: () => boolean,
  correlationSource?: string,
  frontendErrorCount?: number,
): CallToolResult {
  const errorEvents = buffer.query({ level: "error" });
  const errorCount = errorEvents.length;
  // errorEvents are sorted by timestamp descending by the buffer, so first is most recent
  const lastErrorTime = errorCount > 0 ? errorEvents[0].timestamp : null;

  return jsonResult({
    connected: getConnected(),
    error_count: errorCount,
    last_error_time: lastErrorTime,
    session_started_at: buffer.sessionStartedAt,
    correlation_source: correlationSource ?? "none",
    frontend_error_count: frontendErrorCount ?? 0,
  });
}

/**
 * Handle clear_errors tool - removes all events from the buffer.
 *
 * Returns the count of cleared events. Idempotent - clearing an empty buffer returns 0.
 *
 * @param buffer - The event buffer to clear.
 * @returns CallToolResult with JSON { cleared_count }.
 */
export function handleClearErrors(buffer: EventBuffer, args?: Record<string, unknown>): CallToolResult {
  const fingerprint = args?.fingerprint as string | undefined;
  if (fingerprint) {
    const removed = buffer.clearByFingerprint(fingerprint);
    return jsonResult({ cleared_count: removed, fingerprint });
  }
  const cleared = buffer.clear();
  return jsonResult({ cleared_count: cleared });
}

// ──────────────────────────────────────────────
// Server Factory
// ──────────────────────────────────────────────

/**
 * Create and configure the TracePulse MCP server with all tools registered.
 *
 * Each tool delegates to a pure handler function. The server uses stdio transport
 * and is compatible with any MCP client (Kiro, Claude Code, Cursor, etc.).
 *
 * @param buffer - The event buffer backing all tool queries.
 * @param getConnected - Callback returning whether the child process is connected.
 * @param options - Optional Phase 3-5 dependencies. Tools that need them are no-ops when absent.
 * @returns A configured McpServer ready to be connected to a transport.
 */
export function createMcpServer(
  buffer: EventBuffer,
  getConnected: () => boolean,
  options?: {
    registry?: ServiceRegistry;
    frontendBuffer?: FrontendErrorBuffer;
    fingerprintHistory?: FingerprintHistory;
    cwd?: string;
    correlationSource?: string;
  },
): McpServer {
  const server = new McpServer({
    name: "tracepulse",
    version: VERSION,
  });

  server.registerTool("get_errors", {
    title: "Get Errors",
    description:
      "Get recent error and warning events sorted by signal_score descending.",
    inputSchema: {
      since: z.number().optional().describe("Unix ms - only events after this timestamp"),
      source: z.string().optional().describe("Filter by event source"),
      service: z.string().optional().describe("Filter by service name"),
      limit: z.number().optional().describe("Maximum number of results (default 20)"),
      message_contains: z.string().optional().describe("Case-insensitive substring match on message or raw log line. Use for URL/path filtering (e.g., '/api/export')."),
      status_code_min: z.number().optional().describe("Minimum HTTP status code (e.g., 400 for all errors, 500 for server errors only)."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (args) => handleGetErrors(buffer, args as Record<string, unknown>));

  server.registerTool("get_server_logs", {
    title: "Get Server Logs",
    description:
      "Get recent log events at any severity level sorted by timestamp descending.",
    inputSchema: {
      level: z.string().optional().describe("Minimum log level filter"),
      since: z.number().optional().describe("Unix ms - only events after this timestamp"),
      limit: z.number().optional().describe("Maximum number of results (default 50)"),
      message_contains: z.string().optional().describe("Case-insensitive substring match on message or raw log line. Use for URL/path filtering (e.g., '/export', '500', 'error')."),
      status_code_min: z.number().optional().describe("Minimum HTTP status code (e.g., 400 for all errors, 500 for server errors only)."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (args) => handleGetServerLogs(buffer, args as Record<string, unknown>));

  server.registerTool("get_runtime_status", {
    title: "Get Runtime Status",
    description: "Quick health check - connection state, error count, last error time.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, () => handleGetRuntimeStatus(
    buffer,
    getConnected,
    options?.correlationSource,
    options?.frontendBuffer?.size(),
  ));

  server.registerTool("clear_errors", {
    title: "Clear Errors",
    description: "Clear events from the buffer. Pass fingerprint to clear a specific error, or omit to clear all.",
    inputSchema: {
      fingerprint: z.string().optional().describe("Clear only events with this fingerprint. Omit to clear all."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (args) => handleClearErrors(buffer, args as Record<string, unknown>));

  // ── Phase 2 Tools ──

  server.registerTool("watch_for_errors", {
    title: "Watch For Errors",
    description:
      "Block for N seconds and collect any new errors/warnings from the dev server. Use after editing code to verify if the fix worked. Note: hot_reload_detected only works in start mode or when the dev server's reload messages appear in the tailed log file. In attach mode with separate frontend/backend processes, use get_build_errors as the reliable post-change check instead.",
    inputSchema: {
      duration_seconds: z.number().optional().describe("How long to watch (1-120 seconds). Default: 15."),
      source: z.string().optional().describe("Filter by event source"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, (args) => handleWatchForErrors(buffer, args as Record<string, unknown>));

  server.registerTool("get_build_errors", {
    title: "Get Build Errors",
    description:
      "Get current build/compilation errors (TypeScript, ESLint, Vite/webpack). Returns only errors with source 'build-error'.",
    inputSchema: {
      limit: z.number().optional().describe("Maximum number of errors (default 20)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (args) => handleGetBuildErrors(buffer, args as Record<string, unknown>));

  server.registerTool("get_error_context", {
    title: "Get Error Context",
    description:
      "Deep-dive into a specific error by fingerprint. Returns the full error, surrounding logs (±5s), and occurrence count.",
    inputSchema: {
      fingerprint: z.string().describe("The fingerprint of the error to investigate"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (args) => handleGetErrorContext(buffer, args as Record<string, unknown>));

  server.registerTool("get_timeline", {
    title: "Get Timeline",
    description:
      "Get a unified chronological stream of ALL events in a time window. Use for full situational awareness.",
    inputSchema: {
      since: z.number().describe("Unix timestamp in milliseconds"),
      duration_seconds: z.number().optional().describe("Window length in seconds"),
      limit: z.number().optional().describe("Maximum events (default 100, max 500)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (args) => handleGetTimeline(buffer, args as Record<string, unknown>));

  // ── Phase 3 Tools ──

  // ── Phase 3 Tools (always registered) ──

  server.registerTool("list_services", {
    title: "List Services",
    description: "List all monitored services with status, error count, and last activity.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => options?.registry
    ? handleListServices(options.registry)
    : errorResult("list_services requires multi-process mode (--service flags or --config)"));

  // ── Phase 4 Tools (always registered) ──

  server.registerTool("get_correlated_errors", {
    title: "Get Correlated Errors",
    description: "Match browser HTTP failures with backend stack traces. Returns paired errors with confidence scores.",
    inputSchema: { url: z.string().optional().describe("Filter by URL substring") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (args) => options?.frontendBuffer
    ? handleGetCorrelatedErrors(buffer, options.frontendBuffer, args as Record<string, unknown>)
    : errorResult("get_correlated_errors requires frontend error source configuration"));

  // ── Phase 5 Tools (always registered) ──

  server.registerTool("get_new_errors", {
    title: "Get New Errors",
    description: "Get only errors with fingerprints not seen in previous sessions. Focus on what's actually new.",
    inputSchema: { limit: z.number().optional().describe("Maximum results (default 10)") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (args) => options?.fingerprintHistory
    ? handleGetNewErrors(buffer, options.fingerprintHistory, args as Record<string, unknown>)
    : errorResult("get_new_errors requires --persist flag for cross-session fingerprint tracking"));

  server.registerTool("get_error_trends", {
    title: "Get Error Trends",
    description: "Cross-session frequency and history for a specific error fingerprint.",
    inputSchema: { fingerprint: z.string().describe("The fingerprint to look up") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (args) => options?.fingerprintHistory
    ? handleGetErrorTrends(options.fingerprintHistory, args as Record<string, unknown>)
    : errorResult("get_error_trends requires --persist flag for cross-session fingerprint tracking"));

  server.registerTool("correlate_with_diff", {
    title: "Correlate With Diff",
    description:
      "Link recent errors to uncommitted git changes. Shows which errors may be caused by your recent edits.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, () => handleCorrelateWithDiff(buffer, options?.cwd ?? process.cwd()));

  server.registerTool("get_health_summary", {
    title: "Get Health Summary",
    description:
      "One-line health check: error count, warning count, total events, uptime. Use instead of calling get_runtime_status + get_errors + get_server_logs separately.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => handleGetHealthSummary(buffer, getConnected));

  server.registerTool("verify_fix", {
    title: "Verify Fix",
    description:
      "All-in-one post-fix verification: watches for N seconds, checks build errors, reports pass/fail verdict. Use after editing code instead of calling watch_for_errors + get_build_errors + get_errors separately.",
    inputSchema: {
      duration_seconds: z.number().optional().describe("How long to watch (default 15 seconds)."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (args) => handleVerifyFix(buffer, args as Record<string, unknown>));

  return server;
}
