/**
 * JSON structured log parser for TracePulse.
 *
 * Parses JSON-formatted log lines from common structured logging libraries:
 * pino (numeric levels), structlog (event field), logback/bunyan (standard fields).
 * Extracts message, level, stack trace, and trace ID into a ParsedError.
 *
 * This parser is registered in the parser pipeline and tried against every
 * incoming log line. canParse is designed to be fast — a single JSON.parse
 * with field existence checks.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 * @see src/constants/events.ts for LogLevel type
 */

import type { ErrorParser, ParsedError, ScoringHints } from "@/types/parsers.js";
import type { LogLevel } from "@/types/events.js";

// ──────────────────────────────────────────────
// Pino Numeric Level Mapping
// ──────────────────────────────────────────────

/**
 * Maps pino's numeric log levels to TracePulse LogLevel strings.
 * Pino uses: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal.
 * TracePulse has no trace/fatal — 10/20 map to debug, 60 maps to error.
 */
const PINO_LEVEL_MAP: Record<number, LogLevel> = {
  10: "debug",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "error",
};

/**
 * Maps string log level values (case-insensitive) to TracePulse LogLevel.
 * Covers common formats: logback (ERROR), structlog (error), Winston (warn/warning).
 */
const STRING_LEVEL_MAP: Record<string, LogLevel> = {
  error: "error",
  warn: "warn",
  warning: "warn",
  info: "info",
  debug: "debug",
};

// ──────────────────────────────────────────────
// Internal Helpers
// ──────────────────────────────────────────────

/**
 * Attempt to parse a string as JSON. Returns null on any parse failure.
 * Designed to never throw — malformed/truncated JSON returns null.
 *
 * @param line - Raw log line to parse
 * @returns Parsed object or null if not valid JSON
 */
function tryParseJson(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check whether the JSON object has a level/severity field.
 * Accepts both numeric (pino) and string level values.
 */
function hasLevelField(obj: Record<string, unknown>): boolean {
  return obj.level !== undefined || obj.severity !== undefined;
}

/**
 * Check whether the JSON object has a message-like field.
 * Supports msg (pino/bunyan), message (logback/winston), event (structlog).
 */
function hasMessageField(obj: Record<string, unknown>): boolean {
  return obj.msg !== undefined || obj.message !== undefined || obj.event !== undefined;
}

/**
 * Map a raw level value (numeric or string) to a TracePulse LogLevel.
 * Falls back to 'info' for unrecognized values.
 *
 * @param raw - The level value from the JSON log (number or string)
 * @returns Normalized LogLevel
 */
function mapLevel(raw: unknown): LogLevel {
  if (typeof raw === "number") {
    return PINO_LEVEL_MAP[raw] ?? "info";
  }
  if (typeof raw === "string") {
    return STRING_LEVEL_MAP[raw.toLowerCase()] ?? "info";
  }
  return "info";
}

/**
 * Extract the message string from the JSON object.
 * Checks msg (pino), message (logback), event (structlog) in priority order.
 */
function extractMessage(obj: Record<string, unknown>): string {
  return String(obj.msg ?? obj.message ?? obj.event ?? "");
}

/**
 * Extract stack trace from common field names.
 * Checks stack, stack_trace (logback), stackTrace (camelCase variant).
 */
function extractStackTrace(obj: Record<string, unknown>): string | undefined {
  const raw = obj.stack ?? obj.stack_trace ?? obj.stackTrace;
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Extract distributed trace ID from common field names.
 * Checks trace_id, traceId, x-datadog-trace-id.
 */
function extractTraceId(obj: Record<string, unknown>): string | undefined {
  const raw = obj.trace_id ?? obj.traceId ?? obj["x-datadog-trace-id"];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Detect the logging framework based on JSON field patterns.
 * - Numeric level → pino (pino uses 10/20/30/40/50/60)
 * - event field → structlog (Python structlog uses 'event' for message)
 * - Otherwise undefined (generic JSON logger)
 */
function detectFramework(obj: Record<string, unknown>): string | undefined {
  if (typeof obj.level === "number") return "pino";
  if (obj.event !== undefined) return "structlog";
  return undefined;
}

// ──────────────────────────────────────────────
// JSON Log Parser
// ──────────────────────────────────────────────

/**
 * Parser for JSON-formatted structured log lines.
 *
 * Handles pino (numeric levels, msg field), structlog (event field),
 * logback/bunyan/winston (level + message fields), and any JSON logger
 * that emits level/severity + msg/message/event fields.
 *
 * Implements the ErrorParser interface — registered in the parser pipeline
 * and tried against each incoming log line in registration order.
 */
export const jsonLogParser: ErrorParser = {
  name: "json",

  canParse(line: string): boolean {
    const obj = tryParseJson(line);
    if (!obj) return false;
    return hasLevelField(obj) && hasMessageField(obj);
  },

  parse(line: string): ParsedError | null {
    const obj = tryParseJson(line);
    if (!obj) return null;

    const rawLevel = obj.level ?? obj.severity;
    const level = mapLevel(rawLevel);
    const stackTrace = extractStackTrace(obj);

    const scoringHints: ScoringHints = {
      is_unhandled_exception: level === "error",
      has_stack_trace: stackTrace !== undefined,
    };

    return {
      message: extractMessage(obj),
      level,
      stack_trace: stackTrace,
      context: {
        framework: detectFramework(obj),
        trace_id: extractTraceId(obj),
      },
      scoring_hints: scoringHints,
    };
  },
};
