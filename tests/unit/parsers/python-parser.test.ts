/**
 * Unit tests for the Python error parser.
 *
 * Validates detection and extraction of Python tracebacks and standalone
 * exception lines. Covers full tracebacks, common exception types,
 * file:line extraction, site-packages skipping, and negative cases.
 */

import { describe, it, expect } from "vitest";
import { pythonParser } from "@/parsers/python-parser";

// ──────────────────────────────────────────────
// canParse
// ──────────────────────────────────────────────

describe("pythonParser.canParse", () => {
  it("returns true for Traceback header", () => {
    expect(pythonParser.canParse("Traceback (most recent call last):")).toBe(true);
  });

  it("returns true for full traceback block", () => {
    const input = [
      "Traceback (most recent call last):",
      '  File "app.py", line 10, in main',
      "TypeError: unsupported operand",
    ].join("\n");
    expect(pythonParser.canParse(input)).toBe(true);
  });

  it.each([
    "ModuleNotFoundError: No module named 'flask'",
    "ImportError: cannot import name 'foo'",
    "TypeError: unsupported operand type(s)",
    "ValueError: invalid literal for int()",
    "KeyError: 'missing_key'",
    "AttributeError: 'NoneType' object has no attribute 'x'",
    "NameError: name 'undefined_var' is not defined",
    "FileNotFoundError: [Errno 2] No such file or directory",
    "IndentationError: unexpected indent",
    "SyntaxError: invalid syntax",
  ])("returns true for standalone '%s'", (line) => {
    expect(pythonParser.canParse(line)).toBe(true);
  });

  it("returns false for Node.js errors", () => {
    expect(pythonParser.canParse("TypeError: Cannot read properties of undefined")).toBe(false);
    expect(pythonParser.canParse("    at Object.<anonymous> (/app/index.js:5:1)")).toBe(false);
    expect(pythonParser.canParse("Error: ENOENT: no such file or directory")).toBe(false);
  });

  it("returns false for Go panics", () => {
    expect(pythonParser.canParse("goroutine 1 [running]:")).toBe(false);
    expect(pythonParser.canParse("panic: runtime error: index out of range")).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(pythonParser.canParse("Server started on port 8000")).toBe(false);
    expect(pythonParser.canParse("INFO: Application startup complete")).toBe(false);
    expect(pythonParser.canParse("")).toBe(false);
  });
});

// ──────────────────────────────────────────────
// parse - full traceback
// ──────────────────────────────────────────────

describe("pythonParser.parse", () => {
  it("extracts message, stack_trace, and context from a full traceback", () => {
    const input = [
      "Traceback (most recent call last):",
      '  File "/app/main.py", line 42, in handle_request',
      "    result = process(data)",
      '  File "/app/services/processor.py", line 15, in process',
      "    return int(value)",
      "ValueError: invalid literal for int() with base 10: 'abc'",
    ].join("\n");

    const result = pythonParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("ValueError: invalid literal for int() with base 10: 'abc'");
    expect(result!.level).toBe("error");
    expect(result!.stack_trace).toContain('File "/app/main.py", line 42');
    expect(result!.stack_trace).toContain('File "/app/services/processor.py", line 15');
    expect(result!.context.framework).toBe("python");
    expect(result!.context.error_type).toBe("ValueError");
    expect(result!.context.file).toBe("/app/services/processor.py");
    expect(result!.context.line).toBe(15);
  });

  it("skips site-packages frames for user code file:line", () => {
    const input = [
      "Traceback (most recent call last):",
      '  File "/app/views.py", line 8, in index',
      "    return render(request)",
      '  File "/usr/lib/python3.12/site-packages/django/shortcuts.py", line 24, in render',
      "    content = loader.render_to_string(template_name)",
      "NameError: name 'template_name' is not defined",
    ].join("\n");

    const result = pythonParser.parse(input);
    expect(result).not.toBeNull();
    // Should pick the last user-code frame, not the site-packages frame
    expect(result!.context.file).toBe("/app/views.py");
    expect(result!.context.line).toBe(8);
    expect(result!.context.error_type).toBe("NameError");
    expect(result!.scoring_hints.is_user_code).toBe(true);
  });

  it("extracts ImportError from standalone line", () => {
    const input = "ImportError: cannot import name 'app' from 'mypackage'";
    const result = pythonParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toBe(input);
    expect(result!.context.error_type).toBe("ImportError");
    expect(result!.context.framework).toBe("python");
    expect(result!.stack_trace).toBeUndefined();
  });

  it("extracts TypeError", () => {
    const input = "TypeError: unsupported operand type(s) for +: 'int' and 'str'";
    const result = pythonParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.context.error_type).toBe("TypeError");
  });

  it("extracts ValueError from standalone line", () => {
    const input = "ValueError: invalid literal for int() with base 10: 'hello'";
    const result = pythonParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.message).toBe(input);
    expect(result!.context.error_type).toBe("ValueError");
    expect(result!.level).toBe("error");
  });

  it("extracts KeyError", () => {
    const input = "KeyError: 'missing_key'";
    const result = pythonParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.context.error_type).toBe("KeyError");
  });

  it("extracts file path and line number from traceback frames", () => {
    const input = [
      "Traceback (most recent call last):",
      '  File "/home/user/project/app.py", line 99, in main',
      "    run()",
      "RuntimeError: maximum recursion depth exceeded",
    ].join("\n");

    const result = pythonParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("/home/user/project/app.py");
    expect(result!.context.line).toBe(99);
  });

  it("sets scoring_hints correctly for traceback with user code", () => {
    const input = [
      "Traceback (most recent call last):",
      '  File "/app/main.py", line 5, in <module>',
      "    import missing_module",
      "ModuleNotFoundError: No module named 'missing_module'",
    ].join("\n");

    const result = pythonParser.parse(input);
    expect(result).not.toBeNull();
    expect(result!.scoring_hints.is_unhandled_exception).toBe(true);
    expect(result!.scoring_hints.has_stack_trace).toBe(true);
    expect(result!.scoring_hints.is_user_code).toBe(true);
  });

  it("sets scoring_hints for standalone exception (no stack trace)", () => {
    const result = pythonParser.parse("SyntaxError: invalid syntax");
    expect(result).not.toBeNull();
    expect(result!.scoring_hints.is_unhandled_exception).toBe(true);
    expect(result!.scoring_hints.has_stack_trace).toBe(false);
  });

  it("returns null for input that canParse would reject", () => {
    expect(pythonParser.parse("just some random log line")).toBeNull();
  });
});
