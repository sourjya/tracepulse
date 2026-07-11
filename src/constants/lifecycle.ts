/**
 * Lifecycle and event journal constants.
 *
 * Centralized configuration for the M27 effectiveness telemetry system.
 * These values govern journal size limits, timer durations, and
 * episode tracking thresholds.
 *
 * @see src/persistence/event-journal.ts for journal writer
 * @see src/store/lifecycle-fsm.ts for the FSM
 * @see src/constants/limits.ts for RESOLUTION_WINDOW_MS (shared with error-lifecycle.ts)
 */

/** Maximum size of the event journal file before rotation (bytes). */
export const MAX_JOURNAL_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/** Maximum journal entries before forced compaction. */
export const MAX_JOURNAL_ENTRIES = 50_000;

/** Maximum sessions retained in telemetry.json after compaction. */
export const MAX_TELEMETRY_SESSIONS = 50;

/** Maximum message length stored in journal entries (security: no full traces on disk). */
export const MAX_JOURNAL_MESSAGE_LENGTH = 200;

/** Maximum command→fingerprint mappings tracked for re-exercise detection. */
export const MAX_COMMAND_FINGERPRINT_MAPPINGS = 100;
