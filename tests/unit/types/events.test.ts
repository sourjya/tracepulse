/**
 * Unit tests for core type definitions and validation helpers.
 *
 * Tests type guard functions that validate MCP tool parameters at runtime.
 * These guards are the boundary between untrusted agent input and the
 * typed internal pipeline.
 */

import { describe, it, expect } from "vitest";
import {
  isEventSource,
  isLogLevel,
  isSignalStrength,
  validateEventFilters,
} from "@/types/events";

describe("isEventSource", () => {
  it("returns true for valid event sources", () => {
    expect(isEventSource("server-stdout")).toBe(true);
    expect(isEventSource("server-stderr")).toBe(true);
    expect(isEventSource("build-error")).toBe(true);
    expect(isEventSource("docker-log")).toBe(true);
  });

  it("returns false for invalid event sources", () => {
    expect(isEventSource("stdout")).toBe(false);
    expect(isEventSource("")).toBe(false);
    expect(isEventSource("SERVER-STDOUT")).toBe(false);
    expect(isEventSource(42)).toBe(false);
    expect(isEventSource(null)).toBe(false);
    expect(isEventSource(undefined)).toBe(false);
  });
});

describe("isLogLevel", () => {
  it("returns true for valid log levels", () => {
    expect(isLogLevel("error")).toBe(true);
    expect(isLogLevel("warn")).toBe(true);
    expect(isLogLevel("info")).toBe(true);
    expect(isLogLevel("debug")).toBe(true);
  });

  it("returns false for invalid log levels", () => {
    expect(isLogLevel("ERROR")).toBe(false);
    expect(isLogLevel("warning")).toBe(false);
    expect(isLogLevel("trace")).toBe(false);
    expect(isLogLevel("")).toBe(false);
    expect(isLogLevel(null)).toBe(false);
  });
});

describe("isSignalStrength", () => {
  it("returns true for valid signal strengths", () => {
    expect(isSignalStrength("high")).toBe(true);
    expect(isSignalStrength("medium")).toBe(true);
    expect(isSignalStrength("low")).toBe(true);
  });

  it("returns false for invalid signal strengths", () => {
    expect(isSignalStrength("HIGH")).toBe(false);
    expect(isSignalStrength("critical")).toBe(false);
    expect(isSignalStrength("")).toBe(false);
    expect(isSignalStrength(1)).toBe(false);
  });
});

describe("validateEventFilters", () => {
  it("accepts empty filters", () => {
    const result = validateEventFilters({});
    expect(result.valid).toBe(true);
  });

  it("accepts valid since timestamp", () => {
    const result = validateEventFilters({ since: 1714200000000 });
    expect(result.valid).toBe(true);
  });

  it("rejects negative since", () => {
    const result = validateEventFilters({ since: -1 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("since");
  });

  it("rejects zero since", () => {
    const result = validateEventFilters({ since: 0 });
    expect(result.valid).toBe(false);
  });

  it("accepts valid source filter", () => {
    const result = validateEventFilters({ source: "server-stderr" });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid source filter", () => {
    const result = validateEventFilters({ source: "invalid" as any });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("source");
  });

  it("accepts valid limit", () => {
    const result = validateEventFilters({ limit: 10 });
    expect(result.valid).toBe(true);
  });

  it("rejects zero limit", () => {
    const result = validateEventFilters({ limit: 0 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("limit");
  });

  it("rejects negative limit", () => {
    const result = validateEventFilters({ limit: -5 });
    expect(result.valid).toBe(false);
  });

  it("rejects limit exceeding max (100)", () => {
    const result = validateEventFilters({ limit: 101 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("limit");
  });

  it("rejects non-integer limit", () => {
    const result = validateEventFilters({ limit: 10.5 });
    expect(result.valid).toBe(false);
  });

  it("accepts valid level filter", () => {
    const result = validateEventFilters({ level: "error" });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid level filter", () => {
    const result = validateEventFilters({ level: "trace" as any });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("level");
  });

  it("accepts combined valid filters", () => {
    const result = validateEventFilters({
      since: 1714200000000,
      source: "server-stderr",
      limit: 20,
      level: "warn",
    });
    expect(result.valid).toBe(true);
  });
});
