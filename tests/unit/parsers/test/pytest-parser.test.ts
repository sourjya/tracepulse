/**
 * Unit tests for pytest output parser.
 *
 * @see src/parsers/test/pytest-parser.ts
 */

import { describe, it, expect } from "vitest";
import { pytestParser } from "@/parsers/test/pytest-parser.js";

describe("pytest parser", () => {
  it("parses FAILED line with assertion", () => {
    const line = "FAILED tests/test_auth.py::test_login_invalid - AssertionError: assert 401 == 200";
    expect(pytestParser.canParse(line)).toBe(true);
    const result = pytestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
    expect(result!.context.file).toBe("tests/test_auth.py");
    expect(result!.context.error_type).toBe("AssertionError");
    expect(result!.context.framework).toBe("pytest");
  });

  it("parses FAILED line without assertion detail", () => {
    const line = "FAILED tests/test_auth.py::test_login_invalid";
    const result = pytestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("tests/test_auth.py");
  });

  it("parses ERROR line (collection error)", () => {
    const line = "ERROR tests/test_auth.py - ImportError: cannot import name 'login'";
    expect(pytestParser.canParse(line)).toBe(true);
    const result = pytestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
    expect(result!.context.error_type).toBe("ImportError");
  });

  it("parses summary line", () => {
    const line = "===== 2 failed, 15 passed, 1 error in 3.45s =====";
    expect(pytestParser.canParse(line)).toBe(true);
    const result = pytestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("2 failed");
  });

  it("does not match non-pytest lines", () => {
    expect(pytestParser.canParse("GET /api/users 200")).toBe(false);
    expect(pytestParser.canParse("TypeError: Cannot read property")).toBe(false);
  });

  it("has name 'pytest'", () => {
    expect(pytestParser.name).toBe("pytest");
  });
});
