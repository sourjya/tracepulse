/**
 * Tests for start_server failure response enhancements.
 *
 * Verifies that when start_server fails, the response includes:
 * - hint telling the agent to use run_and_watch (not shell)
 * - next_steps with the exact run_and_watch command to diagnose
 * - The command and name for context
 */

import { describe, it, expect } from "vitest";
import { handleStartServer, createServerManager } from "@/tools/start-server.js";

describe("handleStartServer failure response", () => {
  it("includes hint and next_steps when spawn fails", async () => {
    const manager = createServerManager();
    manager.onSpawnRequest = async () => ({ error: "exit code 2" });

    const result = await handleStartServer(manager, { command: "uv run uvicorn app:main" });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);

    expect(parsed.status).toBe("failed");
    expect(parsed.error).toBe("exit code 2");
    expect(parsed.hint).toContain("run_and_watch");
    expect(parsed.hint).toContain("Do NOT fall back to shell");
    expect(parsed.next_steps).toBeDefined();
    expect(parsed.next_steps.length).toBeGreaterThan(0);
    expect(parsed.next_steps[0]).toContain("run_and_watch");
    expect(parsed.next_steps[0]).toContain("uv run uvicorn app:main");
  });

  it("includes cwd in next_steps when provided", async () => {
    const manager = createServerManager();
    manager.onSpawnRequest = async () => ({ error: "command not found" });

    const result = await handleStartServer(manager, {
      command: "bash scripts/start.sh",
      cwd: "/home/user/project",
    });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);

    expect(parsed.next_steps[0]).toContain("/home/user/project");
  });

  it("does not include cwd in next_steps when not provided", async () => {
    const manager = createServerManager();
    manager.onSpawnRequest = async () => ({ error: "failed" });

    const result = await handleStartServer(manager, { command: "npm run dev" });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);

    expect(parsed.next_steps[0]).not.toContain("cwd");
  });

  it("returns error when command is missing", async () => {
    const manager = createServerManager();
    const result = await handleStartServer(manager, {});
    expect(result.isError).toBe(true);
  });

  it("returns error when server already running", async () => {
    const manager = createServerManager();
    manager.setRunning("main", 12345);
    const result = await handleStartServer(manager, { command: "npm run dev" });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("already running");
  });

  it("returns started status with next_steps on success", async () => {
    const manager = createServerManager();
    manager.onSpawnRequest = async () => ({ pid: 99999 });

    const result = await handleStartServer(manager, { command: "npm run dev" });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);

    expect(parsed.status).toBe("started");
    expect(parsed.pid).toBe(99999);
    expect(parsed.next_steps).toContain("wait_for_build()");
  });

  it("returns crashed status when wait=true and server dies", async () => {
    const manager = createServerManager();
    manager.onSpawnRequest = async () => {
      // Simulate: server starts then crashes
      manager.setRunning("main", 88888);
      // Immediately mark as stopped to simulate crash
      setTimeout(() => manager.setStopped("main"), 100);
      return { pid: 88888 };
    };

    const result = await handleStartServer(manager, { command: "bad-server", wait: true });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);

    expect(parsed.status).toBe("crashed");
    expect(parsed.hint).toContain("crashed within 3 seconds");
    expect(parsed.next_steps).toContain("get_server_logs(level: 'error')");
  });
});
