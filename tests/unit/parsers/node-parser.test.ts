/**
 * Unit tests for the Node.js error parser.
 *
 * The node parser detects standard Node.js/V8 error patterns (TypeError,
 * ReferenceError, SyntaxError, etc.) and extracts structured data including
 * message, stack trace, file:line:column context, and scoring hints.
 * Input is a single multi-line string (the full error block with \n).
 *
 * @see src/parsers/node-parser.ts for the implementation
 * @see src/types/parsers.ts for ErrorParser interface
 */

import { describe, it, expect } from "vitest";
import { nodeParser } from "@/parsers/node-parser";

describe("nodeParser", () => {
  // ──────────────────────────────────────────────
  // Identity
  // ──────────────────────────────────────────────

  it("has name 'node'", () => {
    expect(nodeParser.name).toBe("node");
  });

  // ──────────────────────────────────────────────
  // canParse — positive matches
  // ──────────────────────────────────────────────

  it("detects TypeError with stack trace", () => {
    const input = [
      "TypeError: Cannot read properties of undefined (reading 'foo')",
      "    at Object.<anonymous> (/app/src/index.ts:10:5)",
      "    at Module._compile (node:internal/modules/cjs/loader:1234:14)",
    ].join("\n");
    expect(nodeParser.canParse(input)).toBe(true);
  });

  it("detects ReferenceError", () => {
    expect(nodeParser.canParse("ReferenceError: x is not defined")).toBe(true);
  });

  it("detects SyntaxError", () => {
    expect(nodeParser.canParse("SyntaxError: Unexpected token '}'")).toBe(true);
  });

  it("detects RangeError", () => {
    expect(nodeParser.canParse("RangeError: Maximum call stack size exceeded")).toBe(true);
  });

  it("detects URIError", () => {
    expect(nodeParser.canParse("URIError: URI malformed")).toBe(true);
  });

  it("detects EvalError", () => {
    expect(nodeParser.canParse("EvalError: something went wrong")).toBe(true);
  });

  it("detects generic Error", () => {
    expect(nodeParser.canParse("Error: ENOENT: no such file or directory, open '/tmp/missing.txt'")).toBe(true);
  });

  it("detects lines with 'at ' stack frame patterns", () => {
    const input = "    at processTicksAndRejections (node:internal/process/task_queues:95:5)";
    expect(nodeParser.canParse(input)).toBe(true);
  });

  // ──────────────────────────────────────────────
  // canParse — negative matches
  // ──────────────────────────────────────────────

  it("returns false for Python traceback", () => {
    const input = [
      "Traceback (most recent call last):",
      '  File "app.py", line 10, in <module>',
      "    raise ValueError('bad')",
      "ValueError: bad",
    ].join("\n");
    expect(nodeParser.canParse(input)).toBe(false);
  });

  it("returns false for Go panic", () => {
    const input = [
      "goroutine 1 [running]:",
      "main.main()",
      "        /app/main.go:10 +0x68",
    ].join("\n");
    expect(nodeParser.canParse(input)).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(nodeParser.canParse("Server started on port 3000")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(nodeParser.canParse("")).toBe(false);
  });

  // ──────────────────────────────────────────────
  // parse — TypeError with stack trace
  // ──────────────────────────────────────────────

  it("parses TypeError with stack trace", () => {
    const input = [
      "TypeError: Cannot read properties of undefined (reading 'foo')",
      "    at Object.<anonymous> (/app/src/index.ts:10:5)",
      "    at Module._compile (node:internal/modules/cjs/loader:1234:14)",
    ].join("\n");

    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("Cannot read properties of undefined (reading 'foo')");
    expect(result!.level).toBe("error");
    expect(result!.context.error_type).toBe("TypeError");
    expect(result!.context.framework).toBe("node");
    expect(result!.context.file).toBe("/app/src/index.ts");
    expect(result!.context.line).toBe(10);
    expect(result!.context.column).toBe(5);
    expect(result!.scoring_hints.has_stack_trace).toBe(true);
    expect(result!.scoring_hints.is_user_code).toBe(true);
    expect(result!.stack_trace).toBeDefined();
  });

  // ──────────────────────────────────────────────
  // parse — ReferenceError
  // ──────────────────────────────────────────────

  it("parses ReferenceError: x is not defined", () => {
    const input = "ReferenceError: x is not defined";
    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("x is not defined");
    expect(result!.context.error_type).toBe("ReferenceError");
    expect(result!.scoring_hints.has_stack_trace).toBe(false);
  });

  // ──────────────────────────────────────────────
  // parse — SyntaxError
  // ──────────────────────────────────────────────

  it("parses SyntaxError: Unexpected token", () => {
    const input = "SyntaxError: Unexpected token '}'";
    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("Unexpected token '}'");
    expect(result!.context.error_type).toBe("SyntaxError");
  });

  // ──────────────────────────────────────────────
  // parse — ENOENT
  // ──────────────────────────────────────────────

  it("parses Error: ENOENT: no such file or directory", () => {
    const input = "Error: ENOENT: no such file or directory, open '/tmp/missing.txt'";
    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("ENOENT: no such file or directory, open '/tmp/missing.txt'");
    expect(result!.context.error_type).toBe("Error");
  });

  // ──────────────────────────────────────────────
  // parse — HTTP error pattern
  // ──────────────────────────────────────────────

  it("parses HTTP error pattern", () => {
    const input = [
      "Error: Request failed with status code 500",
      "    at createError (/app/src/http-client.ts:15:10)",
    ].join("\n");
    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("Request failed with status code 500");
    expect(result!.scoring_hints.http_status).toBe(500);
  });

  // ──────────────────────────────────────────────
  // parse — stack frame extraction (skip node_modules and node:internal)
  // ──────────────────────────────────────────────

  it("extracts file:line:col from first user-code frame, skipping node_modules", () => {
    const input = [
      "Error: something broke",
      "    at Object.handler (/app/node_modules/express/lib/router.js:50:12)",
      "    at processTicksAndRejections (node:internal/process/task_queues:95:5)",
      "    at UserService.create (/app/src/services/user.ts:42:8)",
      "    at main (/app/src/index.ts:5:3)",
    ].join("\n");

    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("/app/src/services/user.ts");
    expect(result!.context.line).toBe(42);
    expect(result!.context.column).toBe(8);
    expect(result!.scoring_hints.is_user_code).toBe(true);
  });

  it("sets is_user_code false when all frames are node_modules or internal", () => {
    const input = [
      "Error: internal failure",
      "    at Object.handler (/app/node_modules/express/lib/router.js:50:12)",
      "    at processTicksAndRejections (node:internal/process/task_queues:95:5)",
    ].join("\n");

    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.scoring_hints.is_user_code).toBe(false);
    // file/line/column should not be set since no user code frame found
    expect(result!.context.file).toBeUndefined();
  });

  // ──────────────────────────────────────────────
  // parse — stack trace truncation
  // ──────────────────────────────────────────────

  it("truncates stack traces beyond 15 frames", () => {
    const frames = Array.from(
      { length: 20 },
      (_, i) => `    at fn${i} (/app/src/file${i}.ts:${i + 1}:1)`,
    );
    const input = ["Error: deep stack", ...frames].join("\n");

    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    // Count the 'at ' lines in the resulting stack_trace
    const resultFrames = result!.stack_trace!.split("\n").filter((l) => l.includes("at "));
    expect(resultFrames).toHaveLength(15);
  });

  // ──────────────────────────────────────────────
  // parse — unhandled exception detection
  // ──────────────────────────────────────────────

  it("sets is_unhandled_exception for uncaught exception", () => {
    const input = [
      "node:internal/process/promises:289",
      "            triggerUncaughtException(err, true /* fromPromise */);",
      "            ^",
      "",
      "TypeError: Cannot read properties of undefined (reading 'id')",
      "    at handler (/app/src/routes.ts:20:15)",
    ].join("\n");

    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.scoring_hints.is_unhandled_exception).toBe(true);
  });

  it("sets is_unhandled_exception for unhandled rejection", () => {
    const input = [
      "UnhandledPromiseRejectionWarning: Error: connection refused",
      "    at TCPConnectWrap.afterConnect (node:net:1187:16)",
    ].join("\n");

    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.scoring_hints.is_unhandled_exception).toBe(true);
  });

  // ──────────────────────────────────────────────
  // parse — returns null for unparseable input
  // ──────────────────────────────────────────────

  it("returns null when canParse matched but no data extractable", () => {
    // A bare 'at ' line with no error message line
    const input = "    at something (unknown:0:0)";
    const result = nodeParser.parse(input);
    expect(result).toBeNull();
  });

  // ──────────────────────────────────────────────
  // parse — stack frame format: 'at file:line:col' (no parens)
  // ──────────────────────────────────────────────

  it("parses 'at file:line:col' frames without parentheses", () => {
    const input = [
      "Error: crash",
      "    at /app/src/server.ts:99:3",
    ].join("\n");

    const result = nodeParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("/app/src/server.ts");
    expect(result!.context.line).toBe(99);
    expect(result!.context.column).toBe(3);
  });
});
