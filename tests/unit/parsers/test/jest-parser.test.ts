/**
 * Unit tests for Jest output parser.
 *
 * @see src/parsers/test/jest-parser.ts
 */

import { describe, it, expect } from "vitest";
import { jestParser } from "@/parsers/test/jest-parser.js";

describe("jest parser", () => {
  it("parses FAIL header", () => {
    const line = "FAIL src/auth.test.ts";
    expect(jestParser.canParse(line)).toBe(true);
    const result = jestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
    expect(result!.context.file).toBe("src/auth.test.ts");
    expect(result!.context.framework).toBe("jest");
  });

  it("parses failure line with timing", () => {
    const line = "  x should login with valid credentials (15 ms)";
    expect(jestParser.canParse(line)).toBe(true);
    const result = jestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("should login with valid credentials");
  });

  it("parses Expected/Received assertion", () => {
    const line = "    Expected: 200";
    expect(jestParser.canParse(line)).toBe(true);
    const result = jestParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Expected: 200");
  });

  it("does not match non-jest lines", () => {
    expect(jestParser.canParse("GET /api/users 200")).toBe(false);
    expect(jestParser.canParse("TypeError: Cannot read property")).toBe(false);
  });

  it("has name 'jest'", () => {
    expect(jestParser.name).toBe("jest");
  });
});
