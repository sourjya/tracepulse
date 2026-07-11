/**
 * Type definitions for the append-only event journal.
 *
 * The event journal records all significant events (errors, lifecycle transitions,
 * tool calls, session boundaries) as JSONL entries in `.tracepulse/events.jsonl`.
 * This is the foundation for M27 effectiveness telemetry — surviving crashes and
 * eliminating survivorship bias from metrics.
 *
 * Architecture role: These types define the on-disk schema. The journal writer
 * (event-journal.ts) serializes JournalEntry objects to JSONL. The startup
 * compactor reads them back and aggregates into telemetry.json.
 *
 * @see src/persistence/event-journal.ts for the writer/compactor
 * @see src/store/lifecycle-fsm.ts for the state machine that produces lifecycle entries
 * @see .kiro/specs/m27-event-journal/design.md for architecture
 */

// ──────────────────────────────────────────────
// Lifecycle States (D4 + D16)
// ──────────────────────────────────────────────

/**
 * All valid lifecycle states for an error fingerprint.
 *
 * State machine progression:
 * first_seen → surfaced → investigated → edit_observed → suppressed → resolved
 *                                                                   → recurred
 *
 * D16 semantics: `suppressed` is the default outcome (fingerprint absent, unconfirmed).
 * `resolved` requires re-exercise evidence (same command ran again, no recurrence).
 */
export const LIFECYCLE_STATES = [
  "first_seen",
  "surfaced",
  "investigated",
  "edit_observed",
  "suppressed",
  "resolved",
  "recurred",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/**
 * Runtime type guard for LifecycleState values.
 * Used to validate entries read from disk (untrusted data).
 */
export function isLifecycleState(value: unknown): value is LifecycleState {
  return typeof value === "string" && LIFECYCLE_STATES.includes(value as LifecycleState);
}

// ──────────────────────────────────────────────
// Journal Entry Types
// ──────────────────────────────────────────────

/** All valid journal entry type discriminators. */
export const JOURNAL_ENTRY_TYPES = [
  "error",
  "lifecycle",
  "tool_call",
  "session_start",
  "session_end",
] as const;

export type JournalEntryType = (typeof JOURNAL_ENTRY_TYPES)[number];

// ──────────────────────────────────────────────
// Entry Data Payloads
// ──────────────────────────────────────────────

/**
 * Payload for type: 'error' — records an error occurrence.
 * Message truncated to 200 chars for security (no full stack traces on disk).
 */
export interface ErrorEntryData {
  readonly fingerprint: string;
  readonly level: string;
  /** Truncated to 200 chars. */
  readonly message: string;
  readonly signal_score: number;
  readonly source: string;
  readonly service: string;
  readonly context?: {
    readonly file?: string;
    readonly line?: number;
    readonly error_type?: string;
  };
}

/**
 * Payload for type: 'lifecycle' — records a state transition.
 * These entries are the substrate for all M27 metrics.
 */
export interface LifecycleEntryData {
  readonly fingerprint: string;
  readonly from_state: LifecycleState;
  readonly to_state: LifecycleState;
  readonly trigger: string;
}

/**
 * Payload for type: 'tool_call' — records an agent tool invocation.
 * Used to correlate investigation effort with outcomes.
 */
export interface ToolCallEntryData {
  readonly tool: string;
  readonly fingerprint?: string;
  /** Whether this call was related to investigating a specific error. */
  readonly investigating?: boolean;
}

/**
 * Payload for type: 'session_start' — marks the beginning of a TracePulse session.
 * Agent info comes from the MCP initialize handshake (clientInfo).
 */
export interface SessionStartEntryData {
  readonly agent?: { readonly name: string; readonly version?: string };
  readonly project_type?: string;
  /** Set to true when this entry was created by migrating legacy files. */
  readonly migrated?: boolean;
}

/**
 * Payload for type: 'session_end' — marks the end of a TracePulse session.
 * Aggregated metrics for the session.
 */
export interface SessionEndEntryData {
  readonly duration_ms: number;
  readonly errors_surfaced: number;
  readonly errors_suppressed: number;
  readonly errors_resolved: number;
}

// ──────────────────────────────────────────────
// Discriminated Union
// ──────────────────────────────────────────────

/** Base fields present on every journal entry. */
interface JournalEntryBase {
  /** Unix ms timestamp of the event. */
  readonly ts: number;
  /** Session ID — process start time as ISO string. Stable within one TracePulse run. */
  readonly sid: string;
}

/**
 * Discriminated union of all journal entry types.
 * The `type` field determines which `data` payload shape is present.
 */
export type JournalEntry =
  | (JournalEntryBase & { readonly type: "error"; readonly data: ErrorEntryData })
  | (JournalEntryBase & { readonly type: "lifecycle"; readonly data: LifecycleEntryData })
  | (JournalEntryBase & { readonly type: "tool_call"; readonly data: ToolCallEntryData })
  | (JournalEntryBase & { readonly type: "session_start"; readonly data: SessionStartEntryData })
  | (JournalEntryBase & { readonly type: "session_end"; readonly data: SessionEndEntryData });

// ──────────────────────────────────────────────
// Runtime Type Guard
// ──────────────────────────────────────────────

/**
 * Runtime type guard for JournalEntry objects.
 *
 * Validates the structural envelope (type, ts, sid, data present and correct types).
 * Does NOT deep-validate the data payload — that's the responsibility of consumers
 * who switch on `entry.type`.
 *
 * Used to filter corrupt lines when reading the journal from disk.
 */
export function isJournalEntry(value: unknown): value is JournalEntry {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object" || Array.isArray(value)) return false;

  const obj = value as Record<string, unknown>;

  // Required fields: type, ts, sid, data
  if (typeof obj.type !== "string") return false;
  if (!JOURNAL_ENTRY_TYPES.includes(obj.type as JournalEntryType)) return false;
  if (typeof obj.ts !== "number") return false;
  if (typeof obj.sid !== "string") return false;
  if (obj.data === undefined || obj.data === null || typeof obj.data !== "object") return false;

  return true;
}
