/**
 * Core event types for the TracePulse pipeline.
 *
 * Defines RuntimeEvent (the canonical event schema), EventContext,
 * EventFilters, and runtime type guards for validating MCP tool parameters.
 * These types flow through every pipeline stage - collectors produce raw lines,
 * parsers extract structure, normalizers create RuntimeEvents, and MCP tools
 * query them via EventFilters.
 *
 * @see Phase 1 design.md for the full data model specification
 */

import {
  type EventSource,
  type LogLevel,
  type SignalStrength,
  EVENT_SOURCES,
  LOG_LEVELS,
  SIGNAL_STRENGTHS,
} from "@/constants/events.js";
import { MAX_QUERY_LIMIT } from "@/constants/limits.js";

// Re-export constant types so consumers can import from types/events
export type { EventSource, LogLevel, SignalStrength };

// ──────────────────────────────────────────────
// Event Context
// ──────────────────────────────────────────────

/**
 * Structured context extracted from parsed errors.
 * All fields are optional - parsers populate what they can extract.
 */
export interface EventContext {
  /** Source file path where the error originated. */
  readonly file?: string;
  /** Line number in the source file. */
  readonly line?: number;
  /** Column number in the source file. */
  readonly column?: number;
  /** Framework or runtime that produced the error (e.g., 'node', 'python'). */
  readonly framework?: string;
  /** Error class name (e.g., 'TypeError', 'ImportError'). */
  readonly error_type?: string;
  /** Distributed trace ID extracted from headers or structured logs. */
  readonly trace_id?: string;
  /** HTTP status code from access log lines. */
  readonly http_status?: number;
}

// ──────────────────────────────────────────────
// Runtime Event
// ──────────────────────────────────────────────

/**
 * The core event schema. Every log line or error is normalized into this shape.
 * Agents query RuntimeEvents via MCP tools.
 *
 * Immutable after creation except for occurrence_count and timestamp on dedup.
 */
export interface RuntimeEvent {
  /** UUIDv4 - unique per first occurrence. */
  readonly id: string;
  /** Unix milliseconds - updated to latest occurrence on dedup. */
  readonly timestamp: number;
  /** Where the log line came from. */
  readonly source: EventSource;
  /** Which process/service produced this event. Default: 'main'. */
  readonly service: string;
  /** Log severity. */
  readonly level: LogLevel;
  /** Normalized error message, truncated to 500 chars. */
  readonly message: string;
  /** Stack trace, top 15 frames. Undefined for non-error events. */
  readonly stack_trace?: string;
  /** Stable dedup key: hash of source + normalized message + file:line. */
  readonly fingerprint: string;
  /** Additive signal score 0-100. */
  readonly signal_score: number;
  /** Tier derived from signal_score. */
  readonly signal_strength: SignalStrength;
  /** Structured context extracted by parsers. */
  readonly context: EventContext;
  /** Original raw log line(s), truncated to 1000 chars. */
  readonly raw: string;
  /** Unix ms - when this fingerprint was first seen. Never changes on dedup. */
  readonly first_seen: number;
  /** How many times this fingerprint has been seen. Increments on dedup. */
  readonly occurrence_count: number;
}

// ──────────────────────────────────────────────
// Event Filters (MCP tool query parameters)
// ──────────────────────────────────────────────

/**
 * Filters for querying the event buffer via MCP tools.
 * All fields are optional - omitted fields mean "no filter".
 */
export interface EventFilters {
  /** Unix ms - only events after this timestamp. */
  readonly since?: number;
  /** Filter by event source. */
  readonly source?: EventSource;
  /** Minimum log level to include. */
  readonly level?: LogLevel;
  /** Maximum number of results. */
  readonly limit?: number;
  /** Case-insensitive substring match on message or raw fields. */
  readonly message_contains?: string;
  /** Minimum HTTP status code to include (e.g., 400 for 4xx+, 500 for 5xx only). */
  readonly status_code_min?: number;
}

/** Result of validating EventFilters from untrusted MCP input. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

// ──────────────────────────────────────────────
// Type Guards
// ──────────────────────────────────────────────

/**
 * Runtime check for valid EventSource values.
 * Used to validate MCP tool parameters from untrusted agent input.
 */
export function isEventSource(value: unknown): value is EventSource {
  return typeof value === "string" && EVENT_SOURCES.includes(value as EventSource);
}

/**
 * Runtime check for valid LogLevel values.
 * Used to validate MCP tool parameters from untrusted agent input.
 */
export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && LOG_LEVELS.includes(value as LogLevel);
}

/**
 * Runtime check for valid SignalStrength values.
 */
export function isSignalStrength(value: unknown): value is SignalStrength {
  return typeof value === "string" && SIGNAL_STRENGTHS.includes(value as SignalStrength);
}

/**
 * Validate EventFilters from untrusted MCP tool input.
 * Returns { valid: true } if all present fields are valid,
 * or { valid: false, error: string } describing the first invalid field.
 */
export function validateEventFilters(
  filters: Record<string, unknown>,
): ValidationResult {
  if (filters.since !== undefined) {
    if (typeof filters.since !== "number" || filters.since <= 0) {
      return { valid: false, error: "since must be a positive number" };
    }
  }

  if (filters.source !== undefined) {
    if (!isEventSource(filters.source)) {
      return {
        valid: false,
        error: `source must be one of: ${EVENT_SOURCES.join(", ")}`,
      };
    }
  }

  if (filters.level !== undefined) {
    if (!isLogLevel(filters.level)) {
      return {
        valid: false,
        error: `level must be one of: ${LOG_LEVELS.join(", ")}`,
      };
    }
  }

  if (filters.limit !== undefined) {
    if (
      typeof filters.limit !== "number" ||
      !Number.isInteger(filters.limit) ||
      filters.limit <= 0 ||
      filters.limit > MAX_QUERY_LIMIT
    ) {
      return {
        valid: false,
        error: `limit must be a positive integer <= ${MAX_QUERY_LIMIT}`,
      };
    }
  }

  if (filters.message_contains !== undefined) {
    if (typeof filters.message_contains !== "string" || filters.message_contains.length === 0) {
      return { valid: false, error: "message_contains must be a non-empty string" };
    }
  }

  if (filters.status_code_min !== undefined) {
    if (typeof filters.status_code_min !== "number" || filters.status_code_min < 100 || filters.status_code_min > 599) {
      return { valid: false, error: "status_code_min must be a number between 100 and 599" };
    }
  }

  return { valid: true };
}
