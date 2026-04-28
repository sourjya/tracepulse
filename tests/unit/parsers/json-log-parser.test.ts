/**
 * Unit tests for the JSON structured log parser.
 *
 * Verifies parsing of common JSON log formats: pino (numeric levels),
 * structlog (event field), and logback (standard level/message fields).
 * Also tests trace ID extraction, level mapping, and rejection of
 * non-JSON or incomplete JSON input.
 *
 * @see src/parsers/json-log-parser.ts for implementation
 * @see src/types/parsers.ts for ErrorParser interface
 */

import { describe, it, expect } from "vitest";
import { jsonLogParser } from "@/parsers/json-log-parser";

describe("jsonLogParser", () => {
  it("has name 'json'", () => {
    expect(jsonLogParser.name).toBe("json");
  });

  // ──────────────────────────────────────────────
  // canParse — positive cases
  // ──────────────────────────────────────────────

  describe("canParse", () => {
    it("returns true for pino format with numeric level and msg", () => {
      const line = JSON.stringify({ level: 50, msg: "Connection refused", time: 1714200000000 });
      expect(jsonLogParser.canParse(line)).toBe(true);
    });

    it("returns true for structlog format with event and level", () => {
      const line = JSON.stringify({ event: "request_failed", level: "error", timestamp: "2026-04-27T00:00:00Z" });
      expect(jsonLogParser.canParse(line)).toBe(true);
    });

    it("returns true for logback format with level and message", () => {
      const line = JSON.stringify({ timestamp: "2026-04-27T00:00:00Z", level: "ERROR", message: "NullPointerException", stack_trace: "at com.example..." });
      expect(jsonLogParser.canParse(line)).toBe(true);
    });

    it("returns true for severity field instead of level", () => {
      const line = JSON.stringify({ severity: "error", message: "something broke" });
      expect(jsonLogParser.canParse(line)).toBe(true);
    });

    // ──────────────────────────────────────────────
    // canParse — negative cases
    // ──────────────────────────────────────────────

    it("returns false for non-JSON lines", () => {
      expect(jsonLogParser.canParse("plain text log line")).toBe(false);
      expect(jsonLogParser.canParse("Error: something went wrong")).toBe(false);
      expect(jsonLogParser.canParse("")).toBe(false);
    });

    it("returns false for JSON without level/severity field", () => {
      const line = JSON.stringify({ message: "no level here", timestamp: 123 });
      expect(jsonLogParser.canParse(line)).toBe(false);
    });

    it("returns false for JSON without msg/message/event field", () => {
      const line = JSON.stringify({ level: "error", timestamp: 123 });
      expect(jsonLogParser.canParse(line)).toBe(false);
    });

    it("returns false for malformed/truncated JSON without throwing", () => {
      expect(() => jsonLogParser.canParse('{"level":"error","msg":')).not.toThrow();
      expect(jsonLogParser.canParse('{"level":"error","msg":')).toBe(false);
      expect(jsonLogParser.canParse("{")).toBe(false);
      expect(jsonLogParser.canParse("")).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // parse — pino format
  // ──────────────────────────────────────────────

  describe("parse — pino format", () => {
    it("parses pino error with numeric level 50", () => {
      const line = JSON.stringify({ level: 50, msg: "Connection refused", time: 1714200000000 });
      const result = jsonLogParser.parse(line);

      expect(result).not.toBeNull();
      expect(result!.message).toBe("Connection refused");
      expect(result!.level).toBe("error");
      expect(result!.context.framework).toBe("pino");
    });

    it("maps numeric pino levels correctly", () => {
      const cases: Array<[number, string]> = [
        [10, "debug"],
        [20, "debug"],
        [30, "info"],
        [40, "warn"],
        [50, "error"],
        [60, "error"],
      ];

      for (const [numeric, expected] of cases) {
        const line = JSON.stringify({ level: numeric, msg: "test" });
        const result = jsonLogParser.parse(line);
        expect(result!.level).toBe(expected);
      }
    });
  });

  // ──────────────────────────────────────────────
  // parse — structlog format
  // ──────────────────────────────────────────────

  describe("parse — structlog format", () => {
    it("parses structlog with event field as message", () => {
      const line = JSON.stringify({ event: "request_failed", level: "error", timestamp: "2026-04-27T00:00:00Z" });
      const result = jsonLogParser.parse(line);

      expect(result).not.toBeNull();
      expect(result!.message).toBe("request_failed");
      expect(result!.level).toBe("error");
      expect(result!.context.framework).toBe("structlog");
    });
  });

  // ──────────────────────────────────────────────
  // parse — logback JSON format
  // ──────────────────────────────────────────────

  describe("parse — logback JSON format", () => {
    it("parses logback with stack_trace", () => {
      const line = JSON.stringify({
        timestamp: "2026-04-27T00:00:00Z",
        level: "ERROR",
        message: "NullPointerException",
        stack_trace: "at com.example.Main.run(Main.java:42)",
      });
      const result = jsonLogParser.parse(line);

      expect(result).not.toBeNull();
      expect(result!.message).toBe("NullPointerException");
      expect(result!.level).toBe("error");
      expect(result!.stack_trace).toBe("at com.example.Main.run(Main.java:42)");
      expect(result!.scoring_hints.has_stack_trace).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // parse — level string mapping
  // ──────────────────────────────────────────────

  describe("parse — level string mapping", () => {
    const cases: Array<[string, string]> = [
      ["ERROR", "error"],
      ["error", "error"],
      ["WARN", "warn"],
      ["warn", "warn"],
      ["warning", "warn"],
      ["INFO", "info"],
      ["info", "info"],
      ["DEBUG", "debug"],
      ["debug", "debug"],
    ];

    for (const [input, expected] of cases) {
      it(`maps '${input}' to '${expected}'`, () => {
        const line = JSON.stringify({ level: input, message: "test" });
        const result = jsonLogParser.parse(line);
        expect(result!.level).toBe(expected);
      });
    }
  });

  // ──────────────────────────────────────────────
  // parse — trace ID extraction
  // ──────────────────────────────────────────────

  describe("parse — trace ID extraction", () => {
    it("extracts trace_id field", () => {
      const line = JSON.stringify({ level: "error", message: "fail", trace_id: "abc-123" });
      const result = jsonLogParser.parse(line);
      expect(result!.context.trace_id).toBe("abc-123");
    });

    it("extracts traceId field", () => {
      const line = JSON.stringify({ level: "error", message: "fail", traceId: "def-456" });
      const result = jsonLogParser.parse(line);
      expect(result!.context.trace_id).toBe("def-456");
    });

    it("extracts x-datadog-trace-id field", () => {
      const line = JSON.stringify({ level: "error", message: "fail", "x-datadog-trace-id": "ghi-789" });
      const result = jsonLogParser.parse(line);
      expect(result!.context.trace_id).toBe("ghi-789");
    });
  });

  // ──────────────────────────────────────────────
  // parse — stack trace extraction
  // ──────────────────────────────────────────────

  describe("parse — stack trace extraction", () => {
    it("extracts stack field", () => {
      const line = JSON.stringify({ level: "error", msg: "fail", stack: "Error: fail\n    at foo.js:1" });
      const result = jsonLogParser.parse(line);
      expect(result!.stack_trace).toBe("Error: fail\n    at foo.js:1");
      expect(result!.scoring_hints.has_stack_trace).toBe(true);
    });

    it("extracts stackTrace field", () => {
      const line = JSON.stringify({ level: "error", msg: "fail", stackTrace: "Error: fail\n    at bar.js:2" });
      const result = jsonLogParser.parse(line);
      expect(result!.stack_trace).toBe("Error: fail\n    at bar.js:2");
    });

    it("sets has_stack_trace false when no stack present", () => {
      const line = JSON.stringify({ level: "error", msg: "fail" });
      const result = jsonLogParser.parse(line);
      expect(result!.stack_trace).toBeUndefined();
      expect(result!.scoring_hints.has_stack_trace).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // parse — scoring hints
  // ──────────────────────────────────────────────

  describe("parse — scoring hints", () => {
    it("sets is_unhandled_exception true for error level", () => {
      const line = JSON.stringify({ level: "error", message: "crash" });
      const result = jsonLogParser.parse(line);
      expect(result!.scoring_hints.is_unhandled_exception).toBe(true);
    });

    it("sets is_unhandled_exception false for non-error levels", () => {
      const line = JSON.stringify({ level: "warn", message: "slow query" });
      const result = jsonLogParser.parse(line);
      expect(result!.scoring_hints.is_unhandled_exception).toBe(false);
    });
  });
});
