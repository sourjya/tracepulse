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
import { handleGetErrorClusters } from "@/tools/get-error-clusters.js";
import { handleGetMigrationStatus } from "@/tools/get-migration-status.js";
import { handleGetAuditTrail } from "@/tools/get-audit-trail.js";
import { handleGetSessionInsights } from "@/tools/get-session-insights.js";
import { handleCheckDrift } from "@/tools/check-drift.js";
import { handleGetSessionImpact } from "@/tools/get-session-impact.js";
import { handleGetSessionSummary } from "@/tools/get-session-summary.js";
import { handleGetBugPatterns } from "@/tools/get-bug-patterns.js";
import { handleStartServer, handleStopServer, createServerManager, type ServerManager } from "@/tools/start-server.js";
import { LAYER_2_TOOLS } from "@/mcp/tool-layers.js";
import type { PatternAnalyzer } from "@/analysis/pattern-analyzer.js";
import { annotateWithPatterns } from "@/analysis/pattern-injector.js";
import { loadClusterConfig, createToolRegistry, createGatewayHandler } from "@/clusters/gateway.js";
import { createAuditBuffer, type AuditBuffer } from "@/store/audit-buffer.js";
import { handleGetPerfBaseline } from "@/tools/get-perf-baseline.js";
import { createPerfBaseline, type PerfBaseline } from "@/store/perf-baseline.js";
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
import { handleVerifyBuild } from "@/tools/verify-build.js";
import { handleWaitForBuild } from "@/tools/wait-for-build.js";
import { handleWaitForEvent } from "@/tools/wait-for-event.js";
import { handleRunAndWatch } from "@/tools/run-and-watch.js";
import { buildAllowlist } from "@/tools/run-and-watch-allowlist.js";
import { handleGetRequests } from "@/tools/get-requests.js";
import { handleRestartServer, type RestartFn } from "@/tools/restart-server.js";
import { handleGetInfraStatus, handleGetInfraDetail } from "@/tools/get-infra-status.js";
import type { InfraMonitor } from "@/infra/infra-monitor.js";
import { createNoOpInfraMonitor } from "@/infra/infra-monitor.js";
import { handleCheckPort } from "@/tools/check-port.js";
import { handleGetProjectHealth } from "@/tools/get-project-health.js";
import { handleRegisterProbe, handleListProbes, createProbeManager, type ProbeManager } from "@/tools/register-probe.js";
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
import { jsonResult, errorResult } from "@/mcp/response-helpers.js";

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
import { applyScoreDecay } from "@/scoring/score-decay.js";
import { addEmptyDiagnostics } from "@/tools/empty-diagnostics.js";
import type { ErrorLifecycle } from "@/store/error-lifecycle.js";

/**
 * Handle get_errors tool - returns recent errors sorted by signal_score descending.
 *
 * Applies score decay to transient errors (401s, 403s) that haven't recurred
 * within 60 seconds, so persistent errors surface above one-off transients.
 */
export function handleGetErrors(
  buffer: EventBuffer,
  args: Record<string, unknown>,
  errorLifecycle?: ErrorLifecycle,
  patternAnalyzer?: PatternAnalyzer,
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

  // Apply score decay for transient errors and filter resolved/expired via lifecycle
  const decayed = applyScoreDecay(filtered);
  const lifecycle = errorLifecycle;
  const active = lifecycle ? lifecycle.filterActive(decayed) : decayed;

  // Filter out acknowledged errors (W1.1) - agent already investigated these
  const unacknowledged = args._auditBuffer
    ? active.filter((e) => !(args._auditBuffer as AuditBuffer).isAcknowledged(e.fingerprint))
    : active;
  unacknowledged.sort((a, b) => b.signal_score - a.signal_score);
  const limited = unacknowledged.slice(0, limit);

  // Run cross-service correlation on results
  const correlated = correlateEvents(limited, CORRELATION_WINDOW_MS);
  correlated.sort((a, b) => b.signal_score - a.signal_score);

  // Annotate with cross-session patterns if analyzer available (M20)
  const annotated = patternAnalyzer
    ? annotateWithPatterns(correlated, patternAnalyzer)
    : correlated;

  // Inject loop warning if detected (W1.6)
  const loopWarning = args._auditBuffer ? (args._auditBuffer as AuditBuffer).detectLoop() : null;

  return jsonResult(addEmptyDiagnostics("get_errors", {
    errors: annotated,
    total_matching: unacknowledged.length,
    session_started_at: buffer.sessionStartedAt,
    oldest_event_at: buffer.oldestEventAt,
    buffer_cleared_at: buffer.bufferClearedAt,
    last_event_timestamp: correlated.length > 0 ? correlated[0].timestamp : null,
    ...(loopWarning ? { loop_warning: `Repeated ${loopWarning.tool} call (${loopWarning.count}x). ${loopWarning.suggestion}` } : {}),
  }, correlated.length === 0));
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
    isAttachMode?: boolean;
    isStandalone?: boolean;
    restartFn?: RestartFn;
    infraMonitor?: InfraMonitor;
    probeManager?: ProbeManager;
    auditBuffer?: AuditBuffer;
    perfBaseline?: PerfBaseline;
    errorLifecycle?: ErrorLifecycle;
    patternAnalyzer?: PatternAnalyzer;
    serverManager?: ServerManager;
    detectedStacks?: readonly import("@/diagnostics/project-detector.js").ProjectStack[];
    clustered?: boolean;
  },
): McpServer {
  const server = new McpServer({
    name: "tracepulse",
    version: VERSION,
  });

  // Create audit buffer for tracking tool invocations
  const auditBuffer = options?.auditBuffer ?? createAuditBuffer();
  const perfBaseline = options?.perfBaseline ?? createPerfBaseline();

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
  }, (args) => handleGetErrors(buffer, { ...args as Record<string, unknown>, _auditBuffer: auditBuffer }, options?.errorLifecycle, options?.patternAnalyzer));

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

  server.registerTool("acknowledge_error", {
    title: "Acknowledge Error",
    description: "Mark an error as investigated. Acknowledged errors are excluded from get_errors results. Saves tokens by preventing re-investigation.",
    inputSchema: {
      fingerprint: z.string().describe("Fingerprint of the error to acknowledge."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (args) => {
    const fp = args.fingerprint as string;
    if (!fp) return errorResult("fingerprint is required");
    auditBuffer.acknowledge(fp);
    return jsonResult({ acknowledged: fp, message: "Error excluded from future get_errors results." });
  });

  // ── Phase 2 Tools ──

  server.registerTool("watch_for_errors", {
    title: "Watch For Errors",
    description:
      "Watch N seconds for new errors after a code change. Returns events + hot_reload_detected.",
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
  }, (args) => handleWatchForErrors(buffer, args as Record<string, unknown>, options?.isAttachMode));

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

  server.registerTool("get_error_clusters", {
    title: "Get Error Clusters",
    description:
      "Group errors by type + module path. See patterns across the codebase.",
    inputSchema: {
      min_count: z.number().optional().describe("Minimum errors per cluster (default 2)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (args) => handleGetErrorClusters(buffer, args as Record<string, unknown>));

  server.registerTool("get_migration_status", {
    title: "Get Migration Status",
    description:
      "Check or apply database migrations. Auto-detects alembic/prisma/django/knex. Pass apply=true to run pending migrations.",
    inputSchema: {
      framework: z.string().optional().describe("Migration framework: alembic, prisma, django, knex. Auto-detected if omitted."),
      apply: z.boolean().optional().describe("Set true to apply pending migrations (runs upgrade/migrate command)."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (args) => handleGetMigrationStatus(args as Record<string, unknown>, options?.cwd ?? process.cwd()));

  server.registerTool("get_audit_trail", {
    title: "Get Audit Trail",
    description:
      "Review your own MCP tool usage this session. Shows which tools were called, when, with what params, and response sizes. Use to optimize your workflow.",
    inputSchema: {
      limit: z.number().optional().describe("Maximum records to return (default 50)"),
      since: z.number().optional().describe("Only records after this timestamp"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (args) => handleGetAuditTrail(auditBuffer, args as Record<string, unknown>));

  server.registerTool("get_session_insights", {
    title: "Get Session Insights",
    description:
      "Analyze agent effectiveness: uninvestigated errors, verification gaps, tool usage patterns, parser stats. Use at end of session.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => handleGetSessionInsights(buffer, auditBuffer));

  server.registerTool("check_drift", {
    title: "Check Drift",
    description:
      "Check for env, dependency, and migration drift in one call. Detects missing .env vars, lock files, and migration frameworks.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => handleCheckDrift({ cwd: options?.cwd ?? process.cwd() }));

  server.registerTool("get_session_impact", {
    title: "Get Session Impact",
    description: "Environmental report: tokens saved, energy saved (Wh), CO2 saved (g). Shows the impact of using TracePulse this session.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => handleGetSessionImpact(auditBuffer));

  server.registerTool("get_session_summary", {
    title: "Get Session Summary",
    description: "Compact session manifest: errors seen/acknowledged/pending, build status, tool count. ~200 tokens. Use after context compaction.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => handleGetSessionSummary(buffer, auditBuffer));

  server.registerTool("get_perf_baseline", {
    title: "Get Performance Baseline",
    description:
      "Per-endpoint response time percentiles (P50, P95, max) from HTTP access logs. Use to detect performance regressions after code changes.",
    inputSchema: {
      path: z.string().optional().describe("Filter to a specific endpoint path"),
      limit: z.number().optional().describe("Maximum endpoints to return (default 20)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (args) => handleGetPerfBaseline(perfBaseline, args as Record<string, unknown>));

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
      "Post-fix check: watch + build + errors in one call. Returns pass/fail verdict.",
    inputSchema: {
      duration_seconds: z.number().optional().describe("How long to watch (default 15 seconds)."),
      fingerprint: z.string().optional().describe("Verify a specific error is resolved. Pass the fingerprint from get_errors."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (args) => handleVerifyFix(buffer, args as Record<string, unknown>, options?.isAttachMode));

  server.registerTool("verify_build", {
    title: "Verify Build",
    description:
      "Type-check + build + runtime error check in one call. Replaces 3 separate tool calls.",
    inputSchema: {
      typecheck_command: z.string().optional().describe("Type checker command (default: 'npx tsc --noEmit')"),
      build_command: z.string().optional().describe("Build command (default: 'npx vite build')"),
      cwd: z.string().optional().describe("Working directory for commands"),
      duration_seconds: z.number().optional().describe("Runtime watch duration (default: 3)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (args) => handleVerifyBuild(buffer, args as Record<string, unknown>, options?.isAttachMode));

  server.registerTool("wait_for_build", {
    title: "Wait For Build",
    description:
      "Block until next build/hot-reload completes. Event-driven, no polling.",
    inputSchema: {
      timeout_seconds: z.number().optional().describe("Max wait time (default 30s)."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (args) => handleWaitForBuild(buffer, args as Record<string, unknown>));

  server.registerTool("wait_for_event", {
    title: "Wait For Event",
    description:
      "Block until the next event of a specific type arrives. Types: error, warning, build, crash, any.",
    inputSchema: {
      type: z.string().optional().describe("Event type: error, warning, build, crash, any (default: any)."),
      timeout_seconds: z.number().optional().describe("Max wait time (default 30s)."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (args) => handleWaitForEvent(buffer, args as Record<string, unknown>));

  // Build stack-aware allowlist for run_and_watch (M21 Phase 2)
  const allowlist = options?.detectedStacks ? buildAllowlist(options.detectedStacks) : undefined;

  server.registerTool("run_and_watch", {
    title: "Run And Watch",
    description:
      "Run a command, parse output through 26 parsers, return structured pass/fail results. Use INSTEAD OF shell for tests, builds, and linters.",
    inputSchema: {
      command: z.string().describe("Shell command to run (e.g., 'npx vitest run', 'pytest', 'tsc --noEmit')."),
      timeout_seconds: z.number().optional().describe("Max execution time (default 60s)."),
      cwd: z.string().optional().describe("Working directory to run the command in. Use for monorepos (e.g., './frontend' or '/absolute/path')."),
      max_lines: z.number().optional().describe("Maximum output lines to return. Use instead of '| head -20'. Omit for full output (last 100 lines)."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (args) => handleRunAndWatch(args as Record<string, unknown>, allowlist));

  server.registerTool("get_requests", {
    title: "Get Requests",
    description:
      "Get recent HTTP requests from access logs. Filter by URL path and status code. Shows method, path, status, and timing.",
    inputSchema: {
      path: z.string().optional().describe("Filter by URL path substring (e.g., '/api/export')."),
      limit: z.number().optional().describe("Maximum results (default 20)."),
      status_code_min: z.number().optional().describe("Minimum HTTP status code (e.g., 400)."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (args) => handleGetRequests(buffer, args as Record<string, unknown>));

  server.registerTool("restart_server", {
    title: "Restart Server",
    description:
      "Kill and respawn the dev server process. Only works in start mode. Use after installing dependencies, changing config, or when the server is stuck.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, () => handleRestartServer(options?.restartFn ?? null, buffer));

  server.registerTool("get_infra_status", {
    title: "Get Infrastructure Status",
    description:
      "Summary of all discovered backend services (databases, Redis, queues) with connectivity status. Reads from .env files, probes every 60s.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => handleGetInfraStatus(options?.infraMonitor ?? createNoOpInfraMonitor()));

  server.registerTool("get_infra_detail", {
    title: "Get Infrastructure Detail",
    description:
      "Detailed status for a specific infrastructure service including connection history. Use after get_infra_status to investigate an unreachable service.",
    inputSchema: {
      name: z.string().describe("Service name (e.g., 'PostgreSQL', 'Redis')."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (args) => handleGetInfraDetail(
    options?.infraMonitor ?? createNoOpInfraMonitor(),
    args as Record<string, unknown>,
  ));

  server.registerTool("check_port", {
    title: "Check Port",
    description: "Check if TCP port(s) are available or in use on localhost. Accepts single port or array.",
    inputSchema: {
      port: z.number().optional().describe("Single port to check."),
      ports: z.array(z.number()).optional().describe("Array of ports to check (e.g., [3000, 5432, 8080])."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (args) => handleCheckPort(args as Record<string, unknown>));

  server.registerTool("get_project_health", {
    title: "Get Project Health",
    description:
      "Composite health check: server status + infrastructure connectivity + error count + build status in one call. Use as the first call in any debugging session.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => handleGetProjectHealth(
    buffer,
    getConnected,
    options?.infraMonitor ?? null,
    options?.cwd,
    options?.patternAnalyzer,
  ));

  const probeManager = options?.probeManager ?? createProbeManager();

  server.registerTool("register_probe", {
    title: "Register Probe",
    description:
      "Register a health probe for a critical endpoint. TP will check it periodically and alert on failure. Use after building a new API route.",
    inputSchema: {
      name: z.string().describe("Probe name (e.g., 'login', 'health')."),
      method: z.string().optional().describe("HTTP method (default GET)."),
      url: z.string().describe("Full URL to probe (e.g., 'http://localhost:8000/api/health')."),
      body: z.any().optional().describe("Request body for POST/PUT (JSON object)."),
      expect_status: z.number().optional().describe("Expected HTTP status (default 200)."),
      expect_body_contains: z.string().optional().describe("String that must appear in response body."),
      interval_seconds: z.number().optional().describe("Check interval (default 60s)."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (args) => handleRegisterProbe(probeManager, args as Record<string, unknown>));

  server.registerTool("list_probes", {
    title: "List Probes",
    description:
      "List all registered health probes with their latest results (pass/fail/error).",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => handleListProbes(probeManager));


  // ── Bug Pattern Detection (M20) ──

  server.registerTool("get_bug_patterns", {
    title: "Get Bug Patterns",
    description:
      "Analyze cross-session error patterns: recurring bugs, velocity changes, error chains, flaky errors, regressions. Requires persistence (default).",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => options?.patternAnalyzer
    ? handleGetBugPatterns(options.patternAnalyzer)
    : errorResult("get_bug_patterns requires persistence (enabled by default). Was --no-persist used?"));

  // ── M21: Server Lifecycle Tools ──

  const serverManager = options?.serverManager ?? createServerManager();

  server.registerTool("start_server", {
    title: "Start Server",
    description:
      "Start a dev server for live error monitoring. Pre-validates the command and returns diagnostics if invalid. Use when TracePulse started without a server command.",
    inputSchema: {
      command: z.string().describe("Dev server command (e.g., 'npm run dev', 'python manage.py runserver', 'bash scripts/start.sh')."),
      env: z.record(z.string(), z.string()).optional().describe("Environment variables for the server process (e.g., { PYTHONPATH: 'src' })."),
      cwd: z.string().optional().describe("Working directory for the server."),
      name: z.string().optional().describe("Service name for multi-server setups (default: 'main')."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (args) => handleStartServer(serverManager, args as Record<string, unknown>));

  server.registerTool("stop_server", {
    title: "Stop Server",
    description:
      "Stop a running dev server. Sends SIGTERM, waits, then SIGKILL if needed.",
    inputSchema: {
      name: z.string().optional().describe("Service name to stop (default: 'main')."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, (args) => handleStopServer(serverManager, args as Record<string, unknown>));

  // ── Dynamic Tool Layers (M21 Phase 3) ──
  // In standalone mode (no server connected), disable Layer 2 tools.
  // They return "not available" hints. When start_server succeeds,
  // the CLI layer re-enables them and calls sendToolListChanged().
  // In standalone mode (no server command), disable Layer 2 tools.
  // Start mode keeps them enabled because the server will connect shortly.
  if (options?.isStandalone) {
    const internal = server as unknown as {
      _registeredTools: Record<string, { enabled: boolean; disable: () => void }>;
    };
    const layer2Set = new Set(LAYER_2_TOOLS);
    for (const name of layer2Set) {
      if (internal._registeredTools[name]) {
        internal._registeredTools[name].disable();
      }
    }
    process.stderr.write(`[tracepulse] Layer 2 tools disabled (standalone mode). Call start_server() to activate.\n`);
  }

  // ── Clustered Mode: Gateway Proxy Wiring ──
  // In clustered mode, copy all tool handlers into a registry for gateway dispatch,
  // then remove clustered tools from the MCP server and replace with 7 gateways.
  // Standalone tools (run_and_watch, get_requests) stay on the server directly.
  if (options?.clustered) {
    const clusterConfig = loadClusterConfig();
    const toolRegistry = createToolRegistry();

    // Access internal tool storage to populate the registry and remove clustered tools.
    // _registeredTools is a plain object { [name]: RegisteredTool } in the MCP SDK.
    const internal = server as unknown as {
      _registeredTools: Record<string, {
        description?: string;
        inputSchema?: Record<string, unknown>;
        handler: (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>;
        remove: () => void;
      }>;
    };

    // Copy all tool handlers into the registry for gateway dispatch
    for (const [name, tool] of Object.entries(internal._registeredTools)) {
      toolRegistry.register(name, {
        description: tool.description ?? name,
        inputSchema: tool.inputSchema ?? {},
      }, tool.handler);
    }

    // Remove clustered tools from the MCP server (standalone tools stay)
    const standaloneSet = new Set(clusterConfig.standalone ?? []);
    const clusteredToolNames = new Set(clusterConfig.clusters.flatMap(c => [...c.tools]));

    for (const name of clusteredToolNames) {
      internal._registeredTools[name]?.remove();
    }

    // Register 7 gateway tools on the MCP server
    for (const cluster of clusterConfig.clusters) {
      server.registerTool(cluster.gateway, {
        title: cluster.gateway,
        description: cluster.description,
        inputSchema: {
          action: z.string().optional().describe("Sub-tool to invoke. Omit to list available tools in this gateway."),
          confirm: z.boolean().optional().describe("Required for destructive actions (clear_errors, restart_server)."),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, (args) => createGatewayHandler(cluster, toolRegistry)(args as Record<string, unknown>));
    }

    const totalClustered = clusterConfig.clusters.reduce((n, c) => n + c.tools.length, 0);
    process.stderr.write(`[tracepulse] Clustered mode: ${clusterConfig.clusters.length} gateways (${totalClustered} tools) + ${standaloneSet.size} standalone\n`);
  }

  return server;
}
