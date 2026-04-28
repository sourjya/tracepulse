/**
 * Unit tests for CLI multi-process argument parsing.
 *
 * @see src/cli.ts for parseArgs implementation
 */

import { describe, it, expect } from "vitest";
import { parseArgs } from "@/cli.js";

describe("CLI multi-process args", () => {
  it("--service api='npm run dev:api' parses correctly", () => {
    const result = parseArgs(["node", "cli", "start", "--service", "api=npm run dev:api"]);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("start");
    if (result!.command === "start") {
      expect(result!.services).toHaveLength(1);
      expect(result!.services![0]).toEqual({ name: "api", command: "npm run dev:api" });
    }
  });

  it("multiple --service flags produce array", () => {
    const result = parseArgs([
      "node", "cli", "start",
      "--service", "api=npm run dev:api",
      "--service", "worker=npm run worker",
    ]);
    expect(result).not.toBeNull();
    if (result!.command === "start") {
      expect(result!.services).toHaveLength(2);
    }
  });

  it("--config path flag is captured", () => {
    const result = parseArgs(["node", "cli", "start", "--config", "my-config.json", "echo hi"]);
    expect(result).not.toBeNull();
    if (result!.command === "start") {
      expect(result!.configPath).toBe("my-config.json");
    }
  });

  it("--http flag is captured", () => {
    const result = parseArgs(["node", "cli", "start", "--http", "echo hi"]);
    expect(result).not.toBeNull();
    if (result!.command === "start") {
      expect(result!.http).toBe(true);
    }
  });

  it("--http-port flag is captured", () => {
    const result = parseArgs(["node", "cli", "start", "--http-port", "9801", "echo hi"]);
    expect(result).not.toBeNull();
    if (result!.command === "start") {
      expect(result!.httpPort).toBe(9801);
    }
  });

  it("--persist flag is captured", () => {
    const result = parseArgs(["node", "cli", "start", "--persist", "echo hi"]);
    expect(result).not.toBeNull();
    if (result!.command === "start") {
      expect(result!.persist).toBe(true);
    }
  });

  it("start with positional command still works (backward compat)", () => {
    const result = parseArgs(["node", "cli", "start", "npm run dev"]);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("start");
    if (result!.command === "start") {
      expect(result!.target).toBe("npm run dev");
    }
  });

  it("compose subcommand is recognized", () => {
    const result = parseArgs(["node", "cli", "compose"]);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("compose");
  });

  it("compose --file flag is captured", () => {
    const result = parseArgs(["node", "cli", "compose", "--file", "docker-compose.prod.yml"]);
    expect(result).not.toBeNull();
    if (result!.command === "compose") {
      expect(result!.composeFile).toBe("docker-compose.prod.yml");
    }
  });
});
