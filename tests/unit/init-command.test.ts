/**
 * Tests for tracepulse init command.
 *
 * @see src/cli/init-command.ts
 */

import { describe, it, expect } from "vitest";
import { detectMcpClient, type McpClient } from "@/cli/init-command.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
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
