/**
 * Tests for error narrative patterns.
 */

import { describe, it, expect } from "vitest";
import { findNarrative } from "@/scoring/error-narratives.js";

describe("findNarrative", () => {
  it("matches Python ModuleNotFoundError", () => {
    const result = findNarrative("ModuleNotFoundError: No module named 'requests'");
    expect(result).not.toBeNull();
    expect(result!.pattern_name).toBe("python-module-not-found");
    expect(result!.command).toBe("pip install requests");
  });

  it("matches Node.js Cannot find module", () => {
    const result = findNarrative("Cannot find module 'express'");
    expect(result).not.toBeNull();
    expect(result!.pattern_name).toBe("node-module-not-found");
    expect(result!.command).toBe("npm install express");
  });

  it("handles relative path imports differently", () => {
    const result = findNarrative("Cannot find module './utils/helper'");
    expect(result).not.toBeNull();
    expect(result!.command).toBeUndefined();
    expect(result!.suggestion).toContain("import path");
  });

  it("matches PostgreSQL connection refused", () => {
    const result = findNarrative("Error: connect ECONNREFUSED 127.0.0.1:5432");
    expect(result).not.toBeNull();
    expect(result!.pattern_name).toBe("postgres-connection-refused");
    expect(result!.command).toContain("postgresql");
  });

  it("matches Redis connection refused", () => {
    const result = findNarrative("Error: connect ECONNREFUSED 127.0.0.1:6379");
    expect(result).not.toBeNull();
    expect(result!.pattern_name).toBe("redis-connection-refused");
  });

  it("matches relation does not exist", () => {
    const result = findNarrative('relation "users" does not exist');
    expect(result).not.toBeNull();
    expect(result!.pattern_name).toBe("relation-does-not-exist");
    expect(result!.suggestion).toContain("migration");
  });

  it("matches column does not exist", () => {
    const result = findNarrative('column "auth_provider" does not exist');
    expect(result).not.toBeNull();
    expect(result!.pattern_name).toBe("column-does-not-exist");
  });

  it("matches port in use", () => {
    const result = findNarrative("Error: listen EADDRINUSE: address already in use :::3000");
    expect(result).not.toBeNull();
    expect(result!.pattern_name).toBe("port-in-use");
  });

  it("matches out of memory", () => {
    const result = findNarrative("FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory");
    expect(result).not.toBeNull();
    expect(result!.pattern_name).toBe("out-of-memory");
  });

  it("matches TypeScript errors", () => {
    const result = findNarrative("TS2345: Argument of type 'string' is not assignable to parameter of type 'number'");
    expect(result).not.toBeNull();
    expect(result!.pattern_name).toBe("typescript-type-error");
  });

  it("returns null for unrecognized errors", () => {
    const result = findNarrative("Something completely unknown happened");
    expect(result).toBeNull();
  });
});
