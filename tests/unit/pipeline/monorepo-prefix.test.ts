/**
 * Tests for monorepo output prefix parsing.
 *
 * Turborepo and Nx prefix each line with the package name:
 *   api:  Error: Cannot find module 'express'
 *   web:  [vite] Build error
 *
 * The prefix parser extracts the package name and strips it from the line
 * so downstream parsers see clean input.
 *
 * @see .kiro/specs/m16-platform-coverage/requirements.md R5
 */

import { describe, it, expect } from "vitest";
import { parseMonorepoPrefix } from "@/pipeline/monorepo-prefix.js";

describe("parseMonorepoPrefix", () => {
  it("extracts Turborepo prefix", () => {
    const result = parseMonorepoPrefix("api:  Error: Cannot find module 'express'");
    expect(result).not.toBeNull();
    expect(result!.package).toBe("api");
    expect(result!.line).toBe("Error: Cannot find module 'express'");
  });

  it("extracts Nx prefix", () => {
    const result = parseMonorepoPrefix("web: [vite] Build error: missing import");
    expect(result).not.toBeNull();
    expect(result!.package).toBe("web");
    expect(result!.line).toBe("[vite] Build error: missing import");
  });

  it("handles multi-word package names", () => {
    const result = parseMonorepoPrefix("@myorg/api:  Server started on port 3000");
    expect(result).not.toBeNull();
    expect(result!.package).toBe("@myorg/api");
    expect(result!.line).toBe("Server started on port 3000");
  });

  it("returns null for non-prefixed lines", () => {
    expect(parseMonorepoPrefix("Error: something broke")).toBeNull();
    expect(parseMonorepoPrefix("GET /api/users 200")).toBeNull();
    expect(parseMonorepoPrefix("")).toBeNull();
  });

  it("ignores timestamp-like prefixes", () => {
    // "12:34:56" should not be treated as package "12"
    expect(parseMonorepoPrefix("12:34:56 Server started")).toBeNull();
  });

  it("ignores URL-like prefixes", () => {
    // "http:" should not be treated as package "http"
    expect(parseMonorepoPrefix("http://localhost:3000")).toBeNull();
  });
});
