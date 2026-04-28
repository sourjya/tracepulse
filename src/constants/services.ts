/**
 * Service-related constants for Phase 3 multi-process support.
 *
 * Defines service lifecycle statuses, correlation window, persistence limits,
 * and HTTP transport defaults.
 *
 * @see .kiro/specs/phase3-multi-process/design.md for specifications
 */

/** Valid service lifecycle states. */
export const SERVICE_STATUSES = ["running", "stopped", "crashed", "restarting"] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

/** Time window (ms) for cross-service temporal correlation. */
export const CORRELATION_WINDOW_MS = 2000;

/** Maximum fingerprint entries persisted to disk (LRU eviction beyond this). */
export const MAX_PERSISTED_FINGERPRINTS = 5000;

/** Default port for Streamable HTTP transport. */
export const DEFAULT_HTTP_PORT = 9800;

/** Default file path for fingerprint persistence. */
export const FINGERPRINT_PERSISTENCE_PATH = ".tracepulse/fingerprints.json";
