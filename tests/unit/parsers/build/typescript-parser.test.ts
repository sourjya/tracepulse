/**
 * Unit tests for TypeScript compiler error parser.
 *
 * Validates parsing of tsc output format into structured RuntimeEvents
 * with file, line, column, error_type, and appropriate signal scoring.
 *
 * @see src/parsers/build/typescript-parser.ts for the implementation
 * @see .kiro/specs/phase2-watch-mode/design.md for parser specifications
 */

import { describe, it, expect } from "vitest";
import { typescriptParser } from "@/parsers/build/typescript-parser.js";

describe("TypeScript compiler parser", () => {
  it("parses a single-line TS error", () => {
    const line =
      "src/auth.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.";
    expect(typescriptParser.canParse(line)).toBe(true);
    const result = typescriptParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Argument of type");
    expect(result!.level).toBe("error");
    expect(result!.context.file).toBe("src/auth.ts");
    expect(result!.context.line).toBe(42);
    expect(result!.context.column).toBe(5);
    expect(result!.context.error_type).toBe("TS2345");
    expect(result!.context.framework).toBe("typescript");
  });

  it("parses a TS error with different error code", () => {
    const line =
      "src/index.ts(10,1): error TS2304: Cannot find name 'foo'.";
    const result = typescriptParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.error_type).toBe("TS2304");
    expect(result!.context.file).toBe("src/index.ts");
    expect(result!.context.line).toBe(10);
  });

  it("parses a TS warning", () => {
    const line =
      "src/utils.ts(5,3): warning TS6133: 'x' is declared but its value is never read.";
    expect(typescriptParser.canParse(line)).toBe(true);
    const result = typescriptParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("warn");
    expect(result!.context.error_type).toBe("TS6133");
  });

  it("has source scoring hints for build errors", () => {
    const line =
      "src/auth.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.";
    const result = typescriptParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.scoring_hints.is_user_code).toBe(true);
    expect(result!.scoring_hints.has_stack_trace).toBe(false);
  });

  it("does not match non-TS lines", () => {
    expect(typescriptParser.canParse("GET /api/users 200 15ms")).toBe(false);
    expect(typescriptParser.canParse("TypeError: Cannot read property")).toBe(false);
    expect(typescriptParser.canParse("Server listening on port 3000")).toBe(false);
    expect(typescriptParser.canParse("[vite] hmr update")).toBe(false);
  });

  it("has name 'typescript'", () => {
    expect(typescriptParser.name).toBe("typescript");
  });

  it("handles Windows-style paths", () => {
    const line =
      "src\\auth.ts(42,5): error TS2345: Some error message.";
    expect(typescriptParser.canParse(line)).toBe(true);
    const result = typescriptParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("src\\auth.ts");
  });
});
