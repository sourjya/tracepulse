/**
 * Types for the frontend-backend correlation system.
 *
 * @see .kiro/specs/phase4-correlation/design.md for data model
 */

/** Which source produced a frontend error. */
export type CorrelationSourceType = "viewgraph" | "cdp" | "log-collector" | "none";

/** Normalized browser-side HTTP failure. */
export interface FrontendError {
  readonly id: string;
  readonly timestamp: number;
  readonly url: string;
  readonly path: string;
  readonly method: string;
  readonly statusCode: number;
  readonly statusText: string;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly traceId?: string;
  readonly datadogTraceId?: string;
  readonly source: "viewgraph" | "cdp" | "log-collector";
  readonly responseBodySnippet?: string;
  readonly durationMs?: number;
}

/** A matched pair returned by get_correlated_errors. */
export interface CorrelatedError {
  readonly frontend_error: FrontendError;
  readonly backend_error: import("@/types/events.js").RuntimeEvent;
  readonly correlation_confidence: number;
  readonly match_method: "trace-id" | "url-timestamp";
}
