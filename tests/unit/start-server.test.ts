/**
 * Tests for start_server and stop_server MCP tool handlers.
 *
 * @see src/tools/start-server.ts
 * @see .kiro/specs/m21-zero-config/requirements.md Layer 2
 */

import { describe, it, expect } from "vitest";
import { createServer } from "node:net";
import { handleStartServer, handleStopServer, createServerManager } from "@/tools/start-server.js";

/** Binds an OS-chosen port and returns the port + a close handle. */
function bindPort(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      resolve({ port, close: () => new Promise((res) => srv.close(() => res())) });
    });
    srv.on("error", reject);
  });
}

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

  // BUG-021 regression tests
  it("returns port_in_use when specified port is already occupied", async () => {
    const { port, close } = await bindPort();
    try {
      const mgr = createServerManager();
      const result = await handleStartServer(mgr, { command: "npm run dev", port });
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.status).toBe("port_in_use");
      expect(parsed.port).toBe(port);
      expect(parsed.next_steps).toContain("stop_server()");
    } finally {
      await close();
    }
  });

  it("proceeds normally when specified port is free", async () => {
    const { port, close } = await bindPort();
    await close(); // release it — port is now free
    const mgr = createServerManager();
    const result = await handleStartServer(mgr, { command: "npm run dev", port });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    // No spawn callback wired → "ready" or "invalid" (validation), never "port_in_use"
    expect(parsed.status).not.toBe("port_in_use");
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
