/**
 * Phase 4 correlation constants.
 *
 * Buffer sizes, TTLs, confidence scores, and port defaults for
 * the frontend-backend correlation system.
 *
 * @see .kiro/specs/phase4-correlation/design.md for specifications
 */

/** Maximum frontend errors in the ring buffer. */
export const FRONTEND_BUFFER_MAX_SIZE = 200;

/** TTL for frontend errors in milliseconds (5 minutes). */
export const FRONTEND_ERROR_TTL_MS = 5 * 60 * 1000;

/** Maximum time gap (ms) for URL+timestamp correlation. */
export const CORRELATION_MAX_TIME_GAP_MS = 2000;

/** Close timestamp threshold (ms) for higher confidence scoring. */
export const CORRELATION_CLOSE_TIME_MS = 500;

/** Confidence: trace ID match. */
export const CONFIDENCE_TRACE_ID = 1.0;

/** Confidence: exact path + close timestamp. */
export const CONFIDENCE_EXACT_PATH_CLOSE = 0.9;

/** Confidence: exact path + far timestamp. */
export const CONFIDENCE_EXACT_PATH_FAR = 0.7;

/** Confidence: partial path + close timestamp. */
export const CONFIDENCE_PARTIAL_PATH_CLOSE = 0.6;

/** Confidence: partial path + far timestamp. */
export const CONFIDENCE_PARTIAL_PATH_FAR = 0.4;

/** Default port for the log collector HTTP server. */
export const LOG_COLLECTOR_PORT = 9801;

/** ViewGraph polling interval in milliseconds. */
export const VIEWGRAPH_POLL_INTERVAL_MS = 2000;

/** Max consecutive ViewGraph failures before fallback. */
export const VIEWGRAPH_MAX_FAILURES = 3;
