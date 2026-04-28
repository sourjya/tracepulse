/**
 * Unit tests for the Rust error parser.
 *
 * Validates detection and parsing of Rust panic messages in both the legacy
 * format (thread 'main' panicked at 'msg', file:line:col) and the newer
 * format (thread 'main' panicked at file:line:col:\nmsg). Also tests
 * RUST_BACKTRACE stack frame extraction and rejection of non-Rust errors.
 */

import { describe, it, expect } from "vitest";
import { rustParser } from "@/parsers/rust-parser";
import { MAX_STACK_FRAMES } from "@/constants/limits";

// ──────────────────────────────────────────────
// canParse
// ──────────────────────────────────────────────

describe("rustParser.canParse", () => {
  it("has name 'rust'", () => {
    expect(rustParser.name).toBe("rust");
  });

  it("detects legacy panic format", () => {
    expect(
      rustParser.canParse(
        "thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 5', src/main.rs:42:5",
      ),
    ).toBe(true);
  });

  it("detects newer panic format", () => {
    expect(
      rustParser.canParse(
        "thread 'main' panicked at src/main.rs:42:5:\nindex out of bounds",
      ),
    ).toBe(true);
  });

  it("detects named thread panics", () => {
    expect(
      rustParser.canParse(
        "thread 'worker-3' panicked at 'connection refused', src/net.rs:10:1",
      ),
    ).toBe(true);
  });

  it("detects RUST_BACKTRACE output", () => {
    const backtrace = [
      "stack backtrace:",
      "   0: std::panicking::begin_panic",
      "             at /rustc/abc123/library/std/src/panicking.rs:616:12",
    ].join("\n");
    expect(rustParser.canParse(backtrace)).toBe(true);
  });

  it("returns false for Node.js errors", () => {
    expect(
      rustParser.canParse("TypeError: Cannot read properties of undefined"),
    ).toBe(false);
  });

  it("returns false for Python errors", () => {
    expect(
      rustParser.canParse('Traceback (most recent call last):\n  File "app.py", line 10'),
    ).toBe(false);
  });

  it("returns false for Go errors", () => {
    expect(
      rustParser.canParse("goroutine 1 [running]:\nmain.main()"),
    ).toBe(false);
  });

  it("returns false for Java errors", () => {
    expect(
      rustParser.canParse(
        "Exception in thread \"main\" java.lang.NullPointerException",
      ),
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────
// parse — legacy format
// ──────────────────────────────────────────────

describe("rustParser.parse — legacy format", () => {
  it("extracts panic message from legacy format", () => {
    const line =
      "thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 5', src/main.rs:42:5";
    const result = rustParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.message).toBe(
      "index out of bounds: the len is 3 but the index is 5",
    );
    expect(result!.level).toBe("error");
    expect(result!.context.framework).toBe("rust");
    expect(result!.context.error_type).toBe("panic");
  });

  it("extracts file path and line from legacy format", () => {
    const line =
      "thread 'main' panicked at 'division by zero', src/math/calc.rs:99:13";
    const result = rustParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("src/math/calc.rs");
    expect(result!.context.line).toBe(99);
    expect(result!.context.column).toBe(13);
  });

  it("sets scoring hints for unhandled exception", () => {
    const line =
      "thread 'main' panicked at 'explicit panic', src/main.rs:1:1";
    const result = rustParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.scoring_hints.is_unhandled_exception).toBe(true);
  });
});

// ──────────────────────────────────────────────
// parse — newer format
// ──────────────────────────────────────────────

describe("rustParser.parse — newer format", () => {
  it("extracts message from newer panic format", () => {
    const line =
      "thread 'main' panicked at src/main.rs:42:5:\nindex out of bounds: the len is 3 but the index is 5";
    const result = rustParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.message).toBe(
      "index out of bounds: the len is 3 but the index is 5",
    );
    expect(result!.context.file).toBe("src/main.rs");
    expect(result!.context.line).toBe(42);
    expect(result!.context.column).toBe(5);
  });

  it("handles multiline message in newer format", () => {
    const line =
      "thread 'worker' panicked at src/lib.rs:10:1:\ncalled `Option::unwrap()` on a `None` value";
    const result = rustParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.message).toBe(
      "called `Option::unwrap()` on a `None` value",
    );
  });
});

// ──────────────────────────────────────────────
// parse — RUST_BACKTRACE
// ──────────────────────────────────────────────

describe("rustParser.parse — RUST_BACKTRACE", () => {
  it("extracts stack trace from backtrace output", () => {
    const line = [
      "thread 'main' panicked at 'assertion failed', src/main.rs:5:5",
      "stack backtrace:",
      "   0: std::panicking::begin_panic",
      "             at /rustc/abc123/library/std/src/panicking.rs:616:12",
      "   1: myapp::run",
      "             at src/main.rs:5:5",
      "   2: myapp::main",
      "             at src/main.rs:10:1",
    ].join("\n");

    const result = rustParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.stack_trace).toBeDefined();
    expect(result!.scoring_hints.has_stack_trace).toBe(true);
    // Should contain the frame function names
    expect(result!.stack_trace).toContain("std::panicking::begin_panic");
    expect(result!.stack_trace).toContain("myapp::run");
  });

  it("limits stack frames to MAX_STACK_FRAMES", () => {
    const frames = Array.from({ length: 20 }, (_, i) =>
      `   ${i}: some::function_${i}\n             at src/file.rs:${i + 1}:1`,
    );
    const line = [
      "thread 'main' panicked at 'overflow', src/main.rs:1:1",
      "stack backtrace:",
      ...frames,
    ].join("\n");

    const result = rustParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.stack_trace).toBeDefined();
    // Count frame entries — each frame is "N: function\n  at file:line"
    const frameCount = (result!.stack_trace!.match(/^\s*\d+:/gm) ?? []).length;
    expect(frameCount).toBeLessThanOrEqual(MAX_STACK_FRAMES);
  });

  it("returns null for unparseable input that passed canParse", () => {
    // A bare "stack backtrace:" with no panic line and no frames
    const result = rustParser.parse("stack backtrace:");
    expect(result).toBeNull();
  });
});
