/**
 * Tests for persistence-as-default behavior change.
 *
 * Verifies that --persist is now the default and --no-persist opts out.
 *
 * @see src/cli.ts for argument parsing
 */

import { describe, it, expect } from "vitest";
import { parseArgs } from "@/cli.js";

describe("Persistence default", () => {
  it("start command defaults to persist=true", () => {
    const result = parseArgs(["node", "cli.js", "start", "npm run dev"]);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("start");
    if (result!.command === "start") {
      expect(result!.persist).toBe(true);
    }
  });

  it("--no-persist disables persistence", () => {
    const result = parseArgs(["node", "cli.js", "start", "--no-persist", "npm run dev"]);
    expect(result).not.toBeNull();
    if (result!.command === "start") {
      expect(result!.persist).toBe(false);
    }
  });

  it("--persist is still accepted (explicit opt-in, same as default)", () => {
    const result = parseArgs(["node", "cli.js", "start", "--persist", "npm run dev"]);
    expect(result).not.toBeNull();
    if (result!.command === "start") {
      expect(result!.persist).toBe(true);
    }
  });

  it("standalone defaults to persist=true", () => {
    const result = parseArgs(["node", "cli.js", "standalone"]);
    expect(result).not.toBeNull();
    if (result!.command === "standalone") {
      expect(result!.persist).toBe(true);
    }
  });

  it("standalone --no-persist disables", () => {
    const result = parseArgs(["node", "cli.js", "standalone", "--no-persist"]);
    expect(result).not.toBeNull();
    if (result!.command === "standalone") {
      expect(result!.persist).toBe(false);
    }
  });

  it("compose defaults to persist=true", () => {
    const result = parseArgs(["node", "cli.js", "compose"]);
    expect(result).not.toBeNull();
    if (result!.command === "compose") {
      expect(result!.persist).toBe(true);
    }
  });
});
