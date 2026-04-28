/**
 * Unit tests for the event normalizer pipeline stage.
 *
 * Verifies that ParsedError → RuntimeEvent conversion populates all fields
 * correctly, that raw lines produce default info-level events, and that
 * truncation limits are enforced for messages, stack traces, and raw lines.
 *
 * @see src/pipeline/event-normalizer.ts for the implementation under test
 */

import { describe, it, expect } from "vitest";
import { normalizeEvent, normalizeRawLine } from "@/pipeline/event-normalizer";
import type { ParsedError } from "@/types/parsers";
import type { EventSource } from "@/types/events";
import {
  MAX_MESSAGE_LENGTH,
  MAX_STACK_FRAMES,
  MAX_RAW_LINE_LENGTH,
  TRUNCATION_SUFFIX,
} from "@/constants/limits";

// ──────────────────────────────────────────────
// Test Helpers
// ──────────────────────────────────────────────

/** UUID v4 regex — validates format including the version nibble and variant bits. */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** SHA-256 hex digest regex — 64 lowercase hex characters. */
const HEX_64_REGEX = /^[0-9a-f]{64}$/;

/** Builds a fully-populated ParsedError for testing. */
function makeParsedError(overrides: Partial<ParsedError> = {}): ParsedError {
  return {
    message: "TypeError: Cannot read property 'x' of undefined",
    stack_trace: "at foo (app.js:10:5)\nat bar (app.js:20:3)",
    level: "error",
    context: { file: "app.js", line: 10, error_type: "TypeError" },
    scoring_hints: {
      is_unhandled_exception: true,
      has_stack_trace: true,
      is_user_code: true,
    },
    ...overrides,
  };
}

const DEFAULT_SOURCE: EventSource = "server-stderr";

// ──────────────────────────────────────────────
// normalizeEvent
// ──────────────────────────────────────────────

describe("normalizeEvent", () => {
  it("converts ParsedError to RuntimeEvent with all fields populated", () => {
    const parsed = makeParsedError();
    const raw = "TypeError: Cannot read property 'x' of undefined\n    at foo (app.js:10:5)";

    const event = normalizeEvent(parsed, raw, DEFAULT_SOURCE, true);

    expect(event.id).toMatch(UUID_V4_REGEX);
    expect(event.timestamp).toBeTypeOf("number");
    expect(event.source).toBe(DEFAULT_SOURCE);
    expect(event.service).toBe("main");
    expect(event.level).toBe("error");
    expect(event.message).toBe(parsed.message);
    expect(event.stack_trace).toBe(parsed.stack_trace);
    expect(event.context).toEqual(parsed.context);
    expect(event.raw).toBe(raw);
    expect(event.occurrence_count).toBe(1);
    expect(event.first_seen).toBe(event.timestamp);
  });

  it("generates a valid UUID v4 id", () => {
    const event = normalizeEvent(makeParsedError(), "raw", DEFAULT_SOURCE, true);
    expect(event.id).toMatch(UUID_V4_REGEX);
  });

  it("sets default service to 'main'", () => {
    const event = normalizeEvent(makeParsedError(), "raw", DEFAULT_SOURCE, true);
    expect(event.service).toBe("main");
  });

  it("sets default occurrence_count to 1", () => {
    const event = normalizeEvent(makeParsedError(), "raw", DEFAULT_SOURCE, true);
    expect(event.occurrence_count).toBe(1);
  });

  it("sets first_seen equal to timestamp", () => {
    const event = normalizeEvent(makeParsedError(), "raw", DEFAULT_SOURCE, true);
    expect(event.first_seen).toBe(event.timestamp);
  });

  it("computes signal_score as a number between 0 and 100", () => {
    const event = normalizeEvent(makeParsedError(), "raw", DEFAULT_SOURCE, true);
    expect(event.signal_score).toBeTypeOf("number");
    expect(event.signal_score).toBeGreaterThanOrEqual(0);
    expect(event.signal_score).toBeLessThanOrEqual(100);
  });

  it("computes fingerprint as a 64-char hex string", () => {
    const event = normalizeEvent(makeParsedError(), "raw", DEFAULT_SOURCE, true);
    expect(event.fingerprint).toMatch(HEX_64_REGEX);
  });

  it("truncates message at MAX_MESSAGE_LENGTH with suffix", () => {
    const longMessage = "x".repeat(MAX_MESSAGE_LENGTH + 100);
    const parsed = makeParsedError({ message: longMessage });

    const event = normalizeEvent(parsed, "raw", DEFAULT_SOURCE, true);

    const expectedLength = MAX_MESSAGE_LENGTH - TRUNCATION_SUFFIX.length;
    expect(event.message).toBe(
      longMessage.slice(0, expectedLength) + TRUNCATION_SUFFIX,
    );
    expect(event.message.length).toBe(MAX_MESSAGE_LENGTH);
  });

  it("does not truncate message at exactly MAX_MESSAGE_LENGTH", () => {
    const exactMessage = "y".repeat(MAX_MESSAGE_LENGTH);
    const parsed = makeParsedError({ message: exactMessage });

    const event = normalizeEvent(parsed, "raw", DEFAULT_SOURCE, true);

    expect(event.message).toBe(exactMessage);
  });

  it("truncates stack_trace at MAX_STACK_FRAMES frames", () => {
    const frames = Array.from({ length: 25 }, (_, i) => `at fn${i} (file.js:${i}:1)`);
    const parsed = makeParsedError({ stack_trace: frames.join("\n") });

    const event = normalizeEvent(parsed, "raw", DEFAULT_SOURCE, true);

    const resultFrames = event.stack_trace!.split("\n");
    expect(resultFrames).toHaveLength(MAX_STACK_FRAMES);
    expect(resultFrames[0]).toBe("at fn0 (file.js:0:1)");
    expect(resultFrames[MAX_STACK_FRAMES - 1]).toBe(
      `at fn${MAX_STACK_FRAMES - 1} (file.js:${MAX_STACK_FRAMES - 1}:1)`,
    );
  });

  it("truncates raw line at MAX_RAW_LINE_LENGTH with suffix", () => {
    const longRaw = "r".repeat(MAX_RAW_LINE_LENGTH + 200);

    const event = normalizeEvent(makeParsedError(), longRaw, DEFAULT_SOURCE, true);

    const expectedLength = MAX_RAW_LINE_LENGTH - TRUNCATION_SUFFIX.length;
    expect(event.raw).toBe(longRaw.slice(0, expectedLength) + TRUNCATION_SUFFIX);
    expect(event.raw.length).toBe(MAX_RAW_LINE_LENGTH);
  });
});

// ──────────────────────────────────────────────
// normalizeRawLine
// ──────────────────────────────────────────────

describe("normalizeRawLine", () => {
  it("creates a default info-level RuntimeEvent for unmatched lines", () => {
    const line = "Server listening on port 3000";

    const event = normalizeRawLine(line, "server-stdout");

    expect(event.id).toMatch(UUID_V4_REGEX);
    expect(event.source).toBe("server-stdout");
    expect(event.level).toBe("info");
    expect(event.message).toBe(line);
    expect(event.stack_trace).toBeUndefined();
    expect(event.service).toBe("main");
    expect(event.occurrence_count).toBe(1);
    expect(event.first_seen).toBe(event.timestamp);
    expect(event.fingerprint).toMatch(HEX_64_REGEX);
    expect(event.signal_score).toBeGreaterThanOrEqual(0);
    expect(event.signal_score).toBeLessThanOrEqual(100);
  });

  it("truncates long raw lines in the message field", () => {
    const longLine = "z".repeat(MAX_MESSAGE_LENGTH + 50);

    const event = normalizeRawLine(longLine, "server-stdout");

    expect(event.message.length).toBe(MAX_MESSAGE_LENGTH);
    expect(event.message.endsWith(TRUNCATION_SUFFIX)).toBe(true);
  });
});
