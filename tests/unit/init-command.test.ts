/**
 * Tests for tracepulse init command.
 *
 * @see src/cli/init-command.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectMcpClient, runInit } from "@/cli/init-command.js";
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("detectMcpClient", () => {
  it("detects Kiro from .kiro/ directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-init-"));
    mkdirSync(join(dir, ".kiro", "settings"), { recursive: true });
    const client = detectMcpClient(dir);
    expect(client).toBe("kiro");
  });

  it("detects Claude Code from .claude/ directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-init-"));
    mkdirSync(join(dir, ".claude"), { recursive: true });
    const client = detectMcpClient(dir);
    expect(client).toBe("claude");
  });

  it("detects Cursor from .cursor/ directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-init-"));
    mkdirSync(join(dir, ".cursor"), { recursive: true });
    const client = detectMcpClient(dir);
    expect(client).toBe("cursor");
  });

  it("returns generic for unknown", () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-init-"));
    const client = detectMcpClient(dir);
    expect(client).toBe("generic");
  });
});

describe("runInit — claude branch", () => {
  let dir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    // Isolate HOME so the Layer-1 global rules write (~/.claude/rules) lands
    // in a throwaway dir, never the developer's real home.
    dir = mkdtempSync(join(tmpdir(), "tp-init-"));
    mkdirSync(join(dir, ".claude"), { recursive: true });
    originalHome = process.env.HOME;
    process.env.HOME = mkdtempSync(join(tmpdir(), "tp-home-"));
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  // TRP-74: the copied gate script is inert unless registered in a settings file.
  it("registers the PreToolUse gate hook in .claude/settings.json", () => {
    runInit("claude", dir);

    const settingsPath = join(dir, ".claude", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks?: { PreToolUse?: Array<{ matcher?: string; hooks?: Array<{ command?: string }> }> };
    };
    const preToolUse = settings.hooks?.PreToolUse ?? [];

    // A Bash-matched entry must reference the gate script.
    const bashEntries = preToolUse.filter(e => e.matcher === "Bash");
    expect(bashEntries.length).toBeGreaterThan(0);

    const commands = preToolUse.flatMap(e => (e.hooks ?? []).map(h => h.command));
    expect(commands.some(c => typeof c === "string" && c.includes("tracepulse-gate.sh"))).toBe(true);
  });

  // TRP-74: re-running init must not duplicate the gate registration.
  it("is idempotent — re-running does not duplicate the gate registration", () => {
    runInit("claude", dir);
    runInit("claude", dir);

    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8")) as {
      hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> };
    };
    const gateRegistrations = (settings.hooks?.PreToolUse ?? [])
      .flatMap(e => e.hooks ?? [])
      .filter(h => typeof h.command === "string" && h.command.includes("tracepulse-gate.sh"));
    expect(gateRegistrations.length).toBe(1);
  });

  // TRP-74: registration must preserve pre-existing hooks in the settings file.
  it("preserves existing hooks when registering the gate", () => {
    const settingsPath = join(dir, ".claude", "settings.json");
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    writeFileSync(settingsPath, JSON.stringify({
      hooks: { PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo existing" }] }] },
    }, null, 2));

    runInit("claude", dir);

    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks?: { PostToolUse?: unknown[]; PreToolUse?: unknown[] };
    };
    expect(settings.hooks?.PostToolUse).toHaveLength(1);
    expect((settings.hooks?.PreToolUse ?? []).length).toBeGreaterThan(0);
  });

  // TRP-75: Claude Code reads project MCP servers from root .mcp.json, never .claude/mcp.json.
  it("writes MCP config to root .mcp.json, not .claude/mcp.json", () => {
    runInit("claude", dir);

    expect(existsSync(join(dir, ".claude", "mcp.json"))).toBe(false);

    const rootMcp = join(dir, ".mcp.json");
    expect(existsSync(rootMcp)).toBe(true);

    const cfg = JSON.parse(readFileSync(rootMcp, "utf8")) as {
      mcpServers?: Record<string, { command?: string }>;
    };
    expect(cfg.mcpServers?.tracepulse).toBeDefined();
    expect(cfg.mcpServers?.tracepulse.command).toBe("tracepulse");
  });
});
