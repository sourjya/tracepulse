/**
 * Unit tests for config loader.
 *
 * Tests loading config from files, CLI flag parsing, precedence rules,
 * and conflict detection between CLI args and config file.
 *
 * @see src/config/config-loader.ts for the implementation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { loadConfig, parseServiceFlag } from "@/config/config-loader.js";
import * as node_fs from "node:fs";

vi.mock("node:fs");

const mockFs = vi.mocked(node_fs);

describe("config loader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads config from explicit --config path", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ services: [{ name: "api", command: "npm run dev" }] }),
    );

    const result = loadConfig({ configPath: "/path/to/config.json" });
    expect(result.valid).toBe(true);
    expect(result.config!.services).toHaveLength(1);
    expect(mockFs.readFileSync).toHaveBeenCalledWith("/path/to/config.json", "utf-8");
  });

  it("missing explicit config file returns error", () => {
    mockFs.existsSync.mockReturnValue(false);

    const result = loadConfig({ configPath: "/missing/config.json" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("missing default config file silently returns empty config", () => {
    mockFs.existsSync.mockReturnValue(false);

    const result = loadConfig({});
    expect(result.valid).toBe(true);
    expect(result.config).toBeDefined();
  });

  it("CLI service flags override config file", () => {
    mockFs.existsSync.mockReturnValue(false);

    const result = loadConfig({
      services: [{ name: "api", command: "npm run dev" }],
    });
    expect(result.valid).toBe(true);
    expect(result.config!.services).toHaveLength(1);
  });

  it("conflict: CLI services + config file services rejected", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ services: [{ name: "api", command: "cmd" }] }),
    );

    const result = loadConfig({
      configPath: "/path/config.json",
      services: [{ name: "worker", command: "cmd2" }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("conflict");
  });
});

describe("parseServiceFlag", () => {
  it("parses name=command format", () => {
    const result = parseServiceFlag('api="npm run dev:api"');
    expect(result).toEqual({ name: "api", command: "npm run dev:api" });
  });

  it("parses without quotes", () => {
    const result = parseServiceFlag("worker=node worker.js");
    expect(result).toEqual({ name: "worker", command: "node worker.js" });
  });

  it("returns null for invalid format", () => {
    expect(parseServiceFlag("no-equals-sign")).toBeNull();
    expect(parseServiceFlag("=no-name")).toBeNull();
    expect(parseServiceFlag("name=")).toBeNull();
  });
});
