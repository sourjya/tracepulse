/**
 * Unit tests for Vite/webpack build error parser.
 *
 * Validates parsing of Vite internal server errors and webpack module
 * errors into structured ParsedError objects.
 *
 * @see src/parsers/build/vite-webpack-parser.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { viteWebpackParser } from "@/parsers/build/vite-webpack-parser.js";

describe("Vite/webpack build error parser", () => {
  it("parses Vite internal server error", () => {
    const line =
      '[vite] Internal server error: Failed to resolve import "./missing" from "src/App.tsx"';
    expect(viteWebpackParser.canParse(line)).toBe(true);
    const result = viteWebpackParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
    expect(result!.message).toContain("Failed to resolve import");
    expect(result!.context.framework).toBe("vite");
  });

  it("parses Vite pre-transform error", () => {
    const line =
      "[vite] Pre-transform error: Could not resolve entry module";
    const result = viteWebpackParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.framework).toBe("vite");
  });

  it("parses webpack ERROR in line", () => {
    const line = "ERROR in ./src/App.tsx";
    expect(viteWebpackParser.canParse(line)).toBe(true);
    const result = viteWebpackParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
    expect(result!.context.framework).toBe("webpack");
    expect(result!.context.file).toBe("./src/App.tsx");
  });

  it("parses webpack Module not found", () => {
    const line =
      "Module not found: Error: Can't resolve './missing' in '/home/user/project/src'";
    expect(viteWebpackParser.canParse(line)).toBe(true);
    const result = viteWebpackParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Can't resolve");
    expect(result!.context.framework).toBe("webpack");
  });

  it("does not match non-build-error lines", () => {
    expect(viteWebpackParser.canParse("GET /api/users 200 15ms")).toBe(false);
    expect(viteWebpackParser.canParse("TypeError: Cannot read property")).toBe(false);
    expect(viteWebpackParser.canParse("[vite] hmr update /src/App.tsx")).toBe(false);
    expect(viteWebpackParser.canParse("Server listening on port 3000")).toBe(false);
  });

  it("has name 'vite-webpack'", () => {
    expect(viteWebpackParser.name).toBe("vite-webpack");
  });

  it("has scoring hints", () => {
    const line =
      '[vite] Internal server error: Failed to resolve import "./missing" from "src/App.tsx"';
    const result = viteWebpackParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.scoring_hints.is_user_code).toBe(true);
  });
});
