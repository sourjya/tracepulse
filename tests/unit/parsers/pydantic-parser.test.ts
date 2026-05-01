/**
 * Tests for Pydantic validation error parser.
 */

import { describe, it, expect } from "vitest";
import { pydanticParser } from "@/parsers/pydantic-parser.js";

describe("pydanticParser", () => {
  it("parses ValidationError with count and model", () => {
    const line = "pydantic_core._pydantic_core.ValidationError: 2 validation errors for UserCreate";
    expect(pydanticParser.canParse(line)).toBe(true);
    const result = pydanticParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
    expect(result!.context.error_type).toBe("ValidationError");
    expect(result!.context.framework).toBe("pydantic");
    expect(result!.message).toContain("2 validation error(s)");
    expect(result!.message).toContain("UserCreate");
  });

  it("parses old-style ValidationError", () => {
    const line = "pydantic.error_wrappers.ValidationError: 1 validation error for LoginRequest";
    expect(pydanticParser.canParse(line)).toBe(true);
    const result = pydanticParser.parse(line);
    expect(result!.message).toContain("LoginRequest");
  });

  it("parses Field required type=missing", () => {
    const line = "  Field required [type=missing, input_value={'name': 'test'}, input_type=dict]";
    expect(pydanticParser.canParse(line)).toBe(true);
    const result = pydanticParser.parse(line);
    expect(result!.level).toBe("error");
    expect(result!.message).toContain("Field required");
  });

  it("parses Input should be a valid string", () => {
    const line = "  Input should be a valid string [type=string_type, input_value=42, input_type=int]";
    expect(pydanticParser.canParse(line)).toBe(true);
    const result = pydanticParser.parse(line);
    expect(result!.message).toContain("string");
  });

  it("parses value is not a valid email", () => {
    const line = "  value is not a valid email address [type=value_error]";
    expect(pydanticParser.canParse(line)).toBe(true);
    const result = pydanticParser.parse(line);
    expect(result!.message).toContain("email");
  });

  it("ignores unrelated lines", () => {
    expect(pydanticParser.canParse("GET /api/users 200")).toBe(false);
    expect(pydanticParser.canParse("TypeError: Cannot read properties")).toBe(false);
  });
});
