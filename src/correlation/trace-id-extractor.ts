/**
 * Trace ID extraction from HTTP response headers.
 *
 * Parses W3C traceparent and Datadog trace ID headers.
 * Pure function — no I/O, no side effects.
 *
 * @see .kiro/specs/phase4-correlation/design.md for trace ID specifications
 */

/** Result of trace ID extraction. */
export interface TraceIds {
  /** W3C trace ID (32 hex chars) from traceparent header. */
  readonly traceId?: string;
  /** Datadog trace ID from x-datadog-trace-id header. */
  readonly datadogTraceId?: string;
}

/**
 * W3C traceparent format: version-traceid-parentid-flags
 * traceid is 32 hex characters at position 1 (split by '-').
 */
const TRACEPARENT_REGEX = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i;

/**
 * Extract trace IDs from HTTP response headers.
 *
 * Handles case-insensitive header names. traceparent is parsed per
 * W3C Trace Context spec; x-datadog-trace-id is taken as-is.
 *
 * @param headers - Response headers (key-value pairs).
 * @returns Extracted trace IDs (undefined if not found or malformed).
 */
export function extractTraceIds(headers: Readonly<Record<string, string>>): TraceIds {
  // Normalize header names to lowercase for case-insensitive lookup
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    lower[key.toLowerCase()] = value;
  }

  let traceId: string | undefined;
  const traceparent = lower["traceparent"];
  if (traceparent) {
    const match = traceparent.match(TRACEPARENT_REGEX);
    if (match) {
      traceId = match[1];
    }
  }

  const datadogTraceId = lower["x-datadog-trace-id"];

  return { traceId, datadogTraceId };
}
