/**
 * Unit tests for vitest and go test parsers.
 */

import { describe, it, expect } from "vitest";
import { vitestParser } from "@/parsers/test/vitest-parser.js";
import { goTestParser } from "@/parsers/test/go-test-parser.js";

describe("vitest parser", () => {
  it("parses FAIL file line", () => {
    const line = " FAIL  tests/unit/auth.test.ts";
    expect(vitestParser.canParse(line)).toBe(true);
    const result = vitestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("tests/unit/auth.test.ts");
    expect(result!.context.framework).toBe("vitest");
  });

  it("parses assertion error", () => {
    const line = "AssertionError: expected 401 to be 200";
    const result = vitestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
  });

  it("parses summary line", () => {
    const line = " Test Files  2 failed | 10 passed (12)";
    const result = vitestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("2 test file(s) failed");
  });

  it("does not match non-vitest lines", () => {
    expect(vitestParser.canParse("GET /api/users 200")).toBe(false);
  });
});

describe("go test parser", () => {
  it("parses --- FAIL line", () => {
    const line = "--- FAIL: TestLogin (0.00s)";
    expect(goTestParser.canParse(line)).toBe(true);
    const result = goTestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("TestLogin");
    expect(result!.context.framework).toBe("go-test");
  });

  it("parses FAIL summary", () => {
    const line = "FAIL\tgithub.com/user/auth\t0.005s";
    const result = goTestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("github.com/user/auth");
  });

  it("parses error with file:line", () => {
    const line = "    auth_test.go:42: expected 200, got 401";
    const result = goTestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("auth_test.go");
    expect(result!.context.line).toBe(42);
  });

  it("does not match non-go-test lines", () => {
    expect(goTestParser.canParse("Server listening on port 3000")).toBe(false);
  });
});
