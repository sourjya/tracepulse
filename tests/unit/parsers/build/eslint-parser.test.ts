/**
 * Unit tests for ESLint output parser.
 *
 * Validates parsing of ESLint's default formatter output into structured
 * ParsedError objects with file, line, column, rule name, and severity.
 *
 * @see src/parsers/build/eslint-parser.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { eslintParser } from "@/parsers/build/eslint-parser.js";

describe("ESLint parser", () => {
  it("parses an ESLint error line", () => {
    const line = "  10:5  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any";
    expect(eslintParser.canParse(line)).toBe(true);
    const result = eslintParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
    expect(result!.message).toBe("Unexpected any. Specify a different type");
    expect(result!.context.line).toBe(10);
    expect(result!.context.column).toBe(5);
    expect(result!.context.error_type).toBe("@typescript-eslint/no-explicit-any");
    expect(result!.context.framework).toBe("eslint");
  });

  it("parses an ESLint warning line", () => {
    const line = "  15:1  warning  Missing return type  @typescript-eslint/explicit-function-return-type";
    const result = eslintParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("warn");
    expect(result!.context.line).toBe(15);
    expect(result!.context.column).toBe(1);
    expect(result!.context.error_type).toBe("@typescript-eslint/explicit-function-return-type");
  });

  it("parses error with extra spaces in message", () => {
    const line = "  3:10  error  'foo' is not defined  no-undef";
    const result = eslintParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("'foo' is not defined");
    expect(result!.context.error_type).toBe("no-undef");
  });

  it("does not match non-ESLint lines", () => {
    expect(eslintParser.canParse("GET /api/users 200 15ms")).toBe(false);
    expect(eslintParser.canParse("TypeError: Cannot read property")).toBe(false);
    expect(eslintParser.canParse("src/auth.ts(42,5): error TS2345: msg")).toBe(false);
    expect(eslintParser.canParse("/home/user/project/src/utils.ts")).toBe(false);
  });

  it("does not match lines without leading whitespace", () => {
    expect(eslintParser.canParse("10:5  error  msg  rule")).toBe(false);
  });

  it("has name 'eslint'", () => {
    expect(eslintParser.name).toBe("eslint");
  });

  it("has scoring hints for user code", () => {
    const line = "  10:5  error  msg  some-rule";
    const result = eslintParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.scoring_hints.is_user_code).toBe(true);
    expect(result!.scoring_hints.has_stack_trace).toBe(false);
  });
});
