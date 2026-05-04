/**
 * REST API endpoints for the HTTP transport.
 *
 * Thin wrappers around existing MCP tool handlers, exposed as simple
 * GET endpoints for non-MCP consumers (dashboards, health pollers).
 * Only active when --http flag is used.
 *
 * Returns null for unrecognized paths so the MCP handler can process them.
 *
 * @see .kiro/specs/m22-http-rest-api/requirements.md
 */

import type { EventBuffer } from "@/types/collectors.js";
import type { AuditBuffer } from "@/store/audit-buffer.js";
import type { PatternAnalyzer } from "@/analysis/pattern-analyzer.js";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Dependencies injected from the CLI layer. */
export interface RestDeps {
  readonly buffer: EventBuffer;
  readonly auditBuffer: AuditBuffer;
  readonly getConnected: () => boolean;
  readonly sessionStartedAt: number;
  readonly patternAnalyzer?: PatternAnalyzer;
}

/** REST response to send back. */
export interface RestResponse {
  readonly status: number;
  readonly body: string;
  readonly contentType: string;
}

/** Minimal request shape for routing. */
interface RestRequest {
  readonly method: string;
  readonly url: string;
}

// ──────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────

/**
 * Create a REST request handler.
 *
 * Returns a function that takes a request and returns a RestResponse
 * for known endpoints, or null if the request should be passed to
 * the MCP handler.
 *
 * @param deps - Injected dependencies from the CLI layer.
 * @returns Handler function.
 */
export function createRestHandler(deps: RestDeps): (req: RestRequest) => RestResponse | null {
  return (req: RestRequest): RestResponse | null => {
    // Only handle GET requests - POST goes to MCP
    if (req.method !== "GET") return null;

    const url = req.url?.split("?")[0] ?? "";

    switch (url) {
      case "/health":
        return json(200, buildHealth(deps));

      case "/api/session":
        return json(200, buildSession(deps));

      case "/api/errors":
        return json(200, buildErrors(deps));

      case "/api/metrics":
        return json(200, buildMetrics(deps));

      case "/api/patterns":
        return json(200, buildPatterns(deps));

      default:
        return null; // Pass to MCP handler
    }
  };
}

// ──────────────────────────────────────────────
// Endpoint Builders
// ──────────────────────────────────────────────

/** GET /health - lightweight health check for pollers. */
function buildHealth(deps: RestDeps): Record<string, unknown> {
  const errors = deps.buffer.count({ level: "error" });
  const warnings = deps.buffer.count({ level: "warn" }) - errors;
  const uptimeSeconds = Math.round((Date.now() - deps.sessionStartedAt) / 1000);

  return {
    status: "ok",
    connected: deps.getConnected(),
    errors,
    warnings,
    uptime_seconds: uptimeSeconds,
    total_events: deps.buffer.count(),
  };
}

/** GET /api/session - mirrors get_session_summary output. */
function buildSession(deps: RestDeps): Record<string, unknown> {
  const errors = deps.buffer.query({ level: "error" });
  const buildErrors = deps.buffer.query({ source: "build-error" });
  const uptimeMin = Math.round((Date.now() - deps.sessionStartedAt) / 60000);

  return {
    errors: {
      total: errors.length,
      build: buildErrors.length,
    },
    tools_called: deps.auditBuffer.totalInvocations,
    session_minutes: uptimeMin,
    connected: deps.getConnected(),
  };
}

/** GET /api/errors - top 10 errors by signal score. */
function buildErrors(deps: RestDeps): Record<string, unknown> {
  const errors = deps.buffer.query({ level: "error" });
  errors.sort((a, b) => b.signal_score - a.signal_score);
  const top = errors.slice(0, 10).map(e => ({
    fingerprint: e.fingerprint,
    message: e.message,
    signal_score: e.signal_score,
    file: e.context.file,
    line: e.context.line,
    framework: e.context.framework,
    occurrence_count: e.occurrence_count,
  }));

  return { errors: top, total: errors.length };
}

/** GET /api/metrics - tool and parser counts. */
function buildMetrics(deps: RestDeps): Record<string, unknown> {
  return {
    tools: 39,
    parsers: 26,
    connected: deps.getConnected(),
    uptime_seconds: Math.round((Date.now() - deps.sessionStartedAt) / 1000),
    total_events: deps.buffer.count(),
    total_tool_calls: deps.auditBuffer.totalInvocations,
  };
}

/** GET /api/patterns - mirrors get_bug_patterns output. */
function buildPatterns(deps: RestDeps): Record<string, unknown> {
  if (!deps.patternAnalyzer) {
    return { patterns: {}, summary: "Pattern analysis requires persistence (enabled by default)." };
  }
  const analysis = deps.patternAnalyzer.analyze();
  return {
    patterns: {
      recurring: analysis.recurring,
      velocity: analysis.velocity,
      chains: analysis.chains,
      flaky: analysis.flaky,
      fixed_but_back: analysis.fixed_but_back,
      degradation: analysis.degradation,
    },
    summary: analysis.summary,
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Build a JSON REST response. */
function json(status: number, data: Record<string, unknown>): RestResponse {
  return {
    status,
    body: JSON.stringify(data),
    contentType: "application/json",
  };
}
