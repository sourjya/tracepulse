/**
 * Tests for start_server and stop_server MCP tool handlers.
 *
 * @see src/tools/start-server.ts
 * @see .kiro/specs/m21-zero-config/requirements.md Layer 2
 */

import { describe, it, expect } from "vitest";
import { handleStartServer, handleStopServer, createServerManager } from "@/tools/start-server.js";

describe("handleStartServer", () => {
  it("validates command is required", async () => {
    const mgr = createServerManager();
    const result = await handleStartServer(mgr, {});
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain("command");
    expect((result as { isError?: boolean }).isError).toBe(true);
  });

  it("rejects shell env var syntax with diagnostic", async () => {
    const mgr = createServerManager();
    const result = await handleStartServer(mgr, { command: "PYTHONPATH=src python -m app" });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("invalid");
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
    expect(parsed.diagnostics[0].issue).toContain("shell syntax");
  });

  it("rejects shell metacharacters", async () => {
    const mgr = createServerManager();
    const result = await handleStartServer(mgr, { command: "cd backend && python app.py" });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("invalid");
  });

  it("rejects when server already running", async () => {
    const mgr = createServerManager();
    mgr.setRunning("main", 12345);
    const result = await handleStartServer(mgr, { command: "npm run dev" });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain("already running");
  });
});

describe("handleStopServer", () => {
  it("returns error when no server running", async () => {
    const mgr = createServerManager();
    const result = await handleStopServer(mgr, {});
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain("No server");
  });

  it("calls onStopRequest callback to kill the process", async () => {
    const mgr = createServerManager();
    mgr.setRunning("main", 12345);
    let stopCalled = false;
    mgr.onStopRequest = async () => {
      stopCalled = true;
      return { success: true, message: "Server process killed (SIGTERM)." };
    };
    const result = await handleStopServer(mgr, {});
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(stopCalled).toBe(true);
    expect(parsed.success).toBe(true);
    expect(mgr.isRunning()).toBe(false);
  });

  it("does not mark stopped if onStopRequest fails", async () => {
    const mgr = createServerManager();
    mgr.setRunning("main", 12345);
    mgr.onStopRequest = async () => ({ success: false, message: "SIGTERM failed" });
    const result = await handleStopServer(mgr, {});
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(false);
    expect(mgr.isRunning()).toBe(true);
  });

  it("falls back to state-only update without onStopRequest", async () => {
    const mgr = createServerManager();
    mgr.setRunning("main", 12345);
    const result = await handleStopServer(mgr, {});
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("stopped");
    expect(mgr.isRunning()).toBe(false);
  });
});

describe("createServerManager", () => {
  it("tracks running state", () => {
    const mgr = createServerManager();
    expect(mgr.isRunning()).toBe(false);
    mgr.setRunning("main", 99);
    expect(mgr.isRunning()).toBe(true);
    expect(mgr.getPid()).toBe(99);
  });
});
