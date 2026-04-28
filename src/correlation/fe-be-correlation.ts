/**
 * Frontend-backend correlation engine.
 *
 * Matches FrontendErrors with backend RuntimeEvents using:
 * 1. Trace ID matching (highest confidence)
 * 2. URL path + timestamp proximity (heuristic fallback)
 *
 * Pure function — reads from provided arrays, no I/O.
 *
 * @see src/correlation/types.ts for CorrelatedError interface
 * @see src/constants/correlation.ts for confidence scores and thresholds
 */

import type { RuntimeEvent } from "@/types/events.js";
import type { FrontendError, CorrelatedError } from "@/correlation/types.js";
import {
  CONFIDENCE_TRACE_ID,
  CONFIDENCE_EXACT_PATH_CLOSE,
  CONFIDENCE_EXACT_PATH_FAR,
  CORRELATION_MAX_TIME_GAP_MS,
  CORRELATION_CLOSE_TIME_MS,
} from "@/constants/correlation.js";

/** Regex to extract URL paths from error messages (e.g., "GET /api/users"). */
const PATH_IN_MESSAGE = /(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S+)/i;

/**
 * Extract a URL path from a backend error's context or message.
 *
 * @param event - Backend RuntimeEvent.
 * @returns Extracted path, or undefined if none found.
 */
function extractPath(event: RuntimeEvent): string | undefined {
  // Check context first
  if (event.context.file && event.context.file.startsWith("/")) {
    // file is a source file path, not a URL path — skip
  }

  // Check message for HTTP path patterns
  const msgMatch = event.message.match(PATH_IN_MESSAGE);
  if (msgMatch) return msgMatch[1];

  // Check raw log
  const rawMatch = event.raw.match(PATH_IN_MESSAGE);
  if (rawMatch) return rawMatch[1];

  // Check if message contains the path directly
  // Look for /api/ or similar patterns
  const pathMatch = event.message.match(/(\/api\/\S+)/i) || event.raw.match(/(\/api\/\S+)/i);
  if (pathMatch) return pathMatch[1];

  return undefined;
}

/**
 * Correlate frontend errors with backend events.
 *
 * For each frontend error, tries trace ID match first, then falls back
 * to URL path + timestamp proximity. Returns matched pairs sorted by
 * frontend timestamp descending.
 *
 * @param frontendErrors - Frontend HTTP failures.
 * @param backendEvents - Backend RuntimeEvents (error/warn level).
 * @returns Correlated pairs with confidence scores.
 */
export function correlateFrontendBackend(
  frontendErrors: readonly FrontendError[],
  backendEvents: readonly RuntimeEvent[],
): CorrelatedError[] {
  if (frontendErrors.length === 0 || backendEvents.length === 0) return [];

  const results: CorrelatedError[] = [];
  const usedBackend = new Set<string>();

  for (const fe of frontendErrors) {
    // 1. Try trace ID match
    if (fe.traceId) {
      const match = backendEvents.find(
        (be) => be.context.trace_id === fe.traceId && !usedBackend.has(be.id),
      );
      if (match) {
        usedBackend.add(match.id);
        results.push({
          frontend_error: fe,
          backend_error: match,
          correlation_confidence: CONFIDENCE_TRACE_ID,
          match_method: "trace-id",
        });
        continue;
      }
    }

    // 2. Fall back to URL path + timestamp proximity
    let bestMatch: RuntimeEvent | undefined;
    let bestTimeDiff = Infinity;

    for (const be of backendEvents) {
      if (usedBackend.has(be.id)) continue;

      const bePath = extractPath(be);
      if (!bePath) continue;

      // Check if paths match
      const pathsMatch = fe.path === bePath || bePath.startsWith(fe.path) || fe.path.startsWith(bePath);
      if (!pathsMatch) continue;

      const timeDiff = Math.abs(fe.timestamp - be.timestamp);
      if (timeDiff > CORRELATION_MAX_TIME_GAP_MS) continue;

      if (timeDiff < bestTimeDiff) {
        bestTimeDiff = timeDiff;
        bestMatch = be;
      }
    }

    if (bestMatch) {
      usedBackend.add(bestMatch.id);
      const confidence = bestTimeDiff <= CORRELATION_CLOSE_TIME_MS
        ? CONFIDENCE_EXACT_PATH_CLOSE
        : CONFIDENCE_EXACT_PATH_FAR;

      results.push({
        frontend_error: fe,
        backend_error: bestMatch,
        correlation_confidence: confidence,
        match_method: "url-timestamp",
      });
    }
  }

  // Sort by frontend timestamp descending
  results.sort((a, b) => b.frontend_error.timestamp - a.frontend_error.timestamp);
  return results;
}
