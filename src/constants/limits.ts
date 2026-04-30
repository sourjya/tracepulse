/**
 * Size and truncation limits for the TracePulse pipeline.
 *
 * These constants enforce bounded memory usage and token-efficient MCP responses.
 * Values are chosen to balance completeness (enough data for the agent to act)
 * with token budget (don't overwhelm the agent's context window).
 *
 * @see user-project-overrides.md for the source of these values
 */

/** Maximum events the ring buffer holds before FIFO eviction. */
export const RING_BUFFER_MAX_SIZE = 500;

/** Maximum characters in a RuntimeEvent.message field. */
export const MAX_MESSAGE_LENGTH = 500;

/** Maximum stack trace frames included in a RuntimeEvent. */
export const MAX_STACK_FRAMES = 15;

/** Maximum characters in a RuntimeEvent.raw field. */
export const MAX_RAW_LINE_LENGTH = 1000;

/** Default limit for get_errors tool responses. */
export const DEFAULT_ERROR_LIMIT = 20;

/** Default limit for get_server_logs tool responses. */
export const DEFAULT_LOG_LIMIT = 50;

/** Maximum allowed limit parameter in MCP tool queries. */
export const MAX_QUERY_LIMIT = 100;

/** Timeout in seconds waiting for a log file to appear (attach mode). */
export const LOG_FILE_WAIT_TIMEOUT_SECONDS = 30;

/** Timeout in seconds for graceful child process shutdown before SIGKILL. */
export const GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS = 5;

/** Truncation suffix appended when content exceeds max length. */
export const TRUNCATION_SUFFIX = "[truncated]";

/** Maximum raw line length to pass to parsers. Lines longer than this are truncated before parsing to prevent ReDoS. */
export const MAX_PARSE_INPUT_LENGTH = 10_000;

/** Regex to strip ANSI escape codes from log output before parsing. */
export const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*m/g;

// ──────────────────────────────────────────────
// Tool Handler Defaults
// ──────────────────────────────────────────────

/** Default limit for get_new_errors tool. */
export const DEFAULT_NEW_ERRORS_LIMIT = 10;

/** Default limit for get_audit_trail tool. */
export const DEFAULT_AUDIT_TRAIL_LIMIT = 50;

/** Default limit for get_perf_baseline and get_requests tools. */
export const DEFAULT_QUERY_LIMIT = 20;

/** Default timeout for wait_for_build and wait_for_event tools (seconds). */
export const DEFAULT_WAIT_TIMEOUT_SECONDS = 30;

/** Max items in truncated lists (warnings, build errors, history). */
export const MAX_TRUNCATED_LIST = 5;

/** Max pending migrations to show. */
export const MAX_PENDING_MIGRATIONS = 10;
