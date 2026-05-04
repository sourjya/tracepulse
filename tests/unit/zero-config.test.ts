/**
 * Tests for M21 zero-config default behavior.
 *
 * Verifies that bare 'tracepulse' (no args) starts in standalone mode
 * instead of printing help and exiting.
 *
 * @see src/cli.ts parseArgs
 * @see .kiro/specs/m21-zero-config/requirements.md
 */

import { describe, it, expect } from "vitest";
import { parseArgs } from "@/cli.js";

describe("Zero-config default (M21)", () => {
  it("bare invocation (no args) returns standalone command", () => {
    const result = parseArgs(["node", "cli.js"]);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("standalone");
  });

  it("bare invocation defaults to persist=true", () => {
    const result = parseArgs(["node", "cli.js"]);
    expect(result).not.toBeNull();
    if (result!.command === "standalone") {
      expect(result!.persist).toBe(true);
    }
  });

  it("--help still prints help", () => {
    const result = parseArgs(["node", "cli.js", "--help"]);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("help");
  });

  it("--version still prints version", () => {
    const result = parseArgs(["node", "cli.js", "--version"]);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("version");
  });

  it("start with command still works", () => {
    const result = parseArgs(["node", "cli.js", "start", "npm run dev"]);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("start");
  });
});
