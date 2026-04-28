/**
 * Watch mode constants for Phase 2 of TracePulse.
 *
 * Defines duration bounds, context windows, query limits, and signal scores
 * for the watch_for_errors, get_build_errors, get_error_context, and
 * get_timeline MCP tools.
 *
 * @see .kiro/specs/phase2-watch-mode/design.md for the constants specification
 */

/** Default watch duration when not specified by the caller (seconds). */
export const DEFAULT_WATCH_DURATION_SECONDS = 15;

/** Minimum allowed watch duration (seconds). */
export const MIN_WATCH_DURATION_SECONDS = 1;

/** Maximum allowed watch duration (seconds). */
export const MAX_WATCH_DURATION_SECONDS = 120;

/** Time window (ms) around an error for surrounding log context. */
export const ERROR_CONTEXT_WINDOW_MS = 5_000;

/** Maximum surrounding log events returned by get_error_context. */
export const MAX_SURROUNDING_LOGS = 50;

/** Default limit for get_timeline results. */
export const DEFAULT_TIMELINE_LIMIT = 100;

/** Maximum limit for get_timeline results. */
export const MAX_TIMELINE_LIMIT = 500;

/** Default limit for get_build_errors results. */
export const DEFAULT_BUILD_ERRORS_LIMIT = 20;

/** Maximum limit for get_build_errors results. */
export const MAX_BUILD_ERRORS_LIMIT = 100;

/** Signal score assigned to hot-reload detection events. */
export const HOT_RELOAD_SIGNAL_SCORE = 5;

/** Base signal score for build errors (they always block the dev server). */
export const BUILD_ERROR_BASE_SIGNAL_SCORE = 40;
