/**
 * Unit tests for the Go error parser.
 *
 * Verifies detection and extraction of Go panic messages, goroutine stack traces,
 * and runtime errors. The Go parser handles output from `go run`, `go test`, and
 * compiled Go binaries that crash with panics or runtime errors.
 *
 * @see src/parsers/go-parser.ts for the parser implementation
 * @see src/types/parsers.ts for the ErrorParser interface
 */

import { describe, it, expect } from "vitest";
import { goParser } from "@/parsers/go-parser";
import { MAX_STACK_FRAMES } from "@/constants/limits";

describe("goParser", () => {
  it("has name 'go'", () => {
    expect(goParser.name).toBe("go");
  });

  // ──────────────────────────────────────────────
  // canParse — positive cases
  // ──────────────────────────────────────────────

  it("detects goroutine panic header", () => {
    expect(goParser.canParse("goroutine 1 [running]:")).toBe(true);
  });

  it("detects panic: prefix", () => {
    expect(goParser.canParse("panic: something went wrong")).toBe(true);
  });

  it("detects runtime error", () => {
    expect(goParser.canParse("panic: runtime error: index out of range [3] with length 2")).toBe(true);
  });

  it("detects goroutine with high ID", () => {
    expect(goParser.canParse("goroutine 42 [running]:")).toBe(true);
  });

  // ──────────────────────────────────────────────
  // canParse — negative cases
  // ──────────────────────────────────────────────

  it("returns false for Node.js errors", () => {
    expect(goParser.canParse("TypeError: Cannot read properties of undefined")).toBe(false);
    expect(goParser.canParse("    at Object.<anonymous> (/app/index.js:10:5)")).toBe(false);
  });

  it("returns false for Python errors", () => {
    expect(goParser.canParse("Traceback (most recent call last):")).toBe(false);
    expect(goParser.canParse('  File "/app/main.py", line 10, in <module>')).toBe(false);
  });

  it("returns false for plain log lines", () => {
    expect(goParser.canParse("INFO: server started on port 8080")).toBe(false);
  });

  // ──────────────────────────────────────────────
  // parse — goroutine panic with stack trace
  // ──────────────────────────────────────────────

  it("parses goroutine panic with full stack trace", () => {
    const input = [
      "goroutine 1 [running]:",
      "main.handler(0xc0000b2000)",
      "\t/app/server/handler.go:42 +0x1a4",
      "main.main()",
      "\t/app/main.go:15 +0x68",
    ].join("\n");

    const result = goParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("goroutine 1");
    expect(result!.level).toBe("error");
    expect(result!.context.framework).toBe("go");
    expect(result!.context.file).toBe("/app/server/handler.go");
    expect(result!.context.line).toBe(42);
    expect(result!.scoring_hints.is_unhandled_exception).toBe(true);
    expect(result!.scoring_hints.has_stack_trace).toBe(true);
    expect(result!.stack_trace).toContain("handler.go:42");
  });

  // ──────────────────────────────────────────────
  // parse — runtime error: index out of range
  // ──────────────────────────────────────────────

  it("parses panic: runtime error: index out of range", () => {
    const input = [
      "panic: runtime error: index out of range [3] with length 2",
      "",
      "goroutine 1 [running]:",
      "main.process(0xc0000b4000)",
      "\t/app/processor.go:88 +0x2f",
    ].join("\n");

    const result = goParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("runtime error: index out of range [3] with length 2");
    expect(result!.context.error_type).toBe("runtime error: index out of range");
    expect(result!.context.framework).toBe("go");
    expect(result!.context.file).toBe("/app/processor.go");
    expect(result!.context.line).toBe(88);
    expect(result!.scoring_hints.is_unhandled_exception).toBe(true);
  });

  // ──────────────────────────────────────────────
  // parse — file path and line extraction
  // ──────────────────────────────────────────────

  it("extracts file:line from Go stack frame without hex offset", () => {
    const input = [
      "panic: nil pointer dereference",
      "",
      "goroutine 1 [running]:",
      "pkg.Handler()",
      "\t/home/user/project/pkg/handler.go:27",
    ].join("\n");

    const result = goParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("/home/user/project/pkg/handler.go");
    expect(result!.context.line).toBe(27);
  });

  it("extracts file:line from frame with +0xNN offset", () => {
    const input = [
      "panic: bad request",
      "",
      "goroutine 5 [running]:",
      "net/http.(*conn).serve(0xc000136000)",
      "\t/usr/local/go/src/net/http/server.go:1995 +0x1422",
    ].join("\n");

    const result = goParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("/usr/local/go/src/net/http/server.go");
    expect(result!.context.line).toBe(1995);
  });

  // ──────────────────────────────────────────────
  // parse — simple panic without goroutine header
  // ──────────────────────────────────────────────

  it("parses simple panic without goroutine header", () => {
    const input = "panic: assignment to entry in nil map";

    const result = goParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("assignment to entry in nil map");
    expect(result!.context.framework).toBe("go");
    expect(result!.context.error_type).toBe("panic");
    expect(result!.scoring_hints.is_unhandled_exception).toBe(true);
    expect(result!.scoring_hints.has_stack_trace).toBe(false);
  });

  // ──────────────────────────────────────────────
  // parse — stack frame limit
  // ──────────────────────────────────────────────

  it("limits stack trace to MAX_STACK_FRAMES", () => {
    const frames = Array.from({ length: 20 }, (_, i) => [
      `main.func${i}()`,
      `\t/app/file${i}.go:${i + 1} +0x${i.toString(16)}`,
    ].join("\n")).join("\n");

    const input = `panic: overflow\n\ngoroutine 1 [running]:\n${frames}`;

    const result = goParser.parse(input);
    expect(result).not.toBeNull();
    // Each frame is 2 lines; MAX_STACK_FRAMES frames = MAX_STACK_FRAMES * 2 lines
    const traceLines = result!.stack_trace!.split("\n").filter((l) => l.trim());
    expect(traceLines.length).toBeLessThanOrEqual(MAX_STACK_FRAMES * 2);
  });
});
