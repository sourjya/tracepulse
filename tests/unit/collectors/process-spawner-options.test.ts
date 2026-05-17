/**
 * Tests for process-spawner cwd, env, and PATH prepending.
 *
 * Verifies that start_server's spawner correctly:
 * - Passes cwd to the child process
 * - Passes env overrides to the child process
 * - Prepends node_modules/.bin and .venv/bin to PATH
 * - Falls back gracefully when directories don't exist
 */

import { describe, it, expect } from "vitest";
import { createProcessSpawner } from "@/collectors/process-spawner.js";

describe("createProcessSpawner with options", () => {
  it("spawns with cwd and child sees correct working directory", async () => {
    const spawner = createProcessSpawner("pwd", { cwd: "/tmp" });
    const lines: string[] = [];
    await spawner.start((_source, line) => { lines.push(line); });
    // Wait for process to finish
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(lines.some(l => l.includes("/tmp"))).toBe(true);
    await spawner.stop();
  });

  it("spawns with env overrides visible to child", async () => {
    const spawner = createProcessSpawner("echo $TEST_VAR_XYZ", { env: { TEST_VAR_XYZ: "hello_from_tp" } });
    const lines: string[] = [];
    await spawner.start((_source, line) => { lines.push(line); });
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(lines.some(l => l.includes("hello_from_tp"))).toBe(true);
    await spawner.stop();
  });

  it("prepends node_modules/.bin to PATH when it exists in cwd", async () => {
    // Use the tracepulse project itself which has node_modules/.bin
    const cwd = process.cwd();
    const spawner = createProcessSpawner("echo $PATH", { cwd });
    const lines: string[] = [];
    await spawner.start((_source, line) => { lines.push(line); });
    await new Promise(resolve => setTimeout(resolve, 500));
    const pathLine = lines.find(l => l.includes("node_modules/.bin"));
    expect(pathLine).toBeTruthy();
    await spawner.stop();
  });

  it("does not crash when cwd has no node_modules or .venv", async () => {
    const spawner = createProcessSpawner("echo ok", { cwd: "/tmp" });
    const lines: string[] = [];
    await spawner.start((_source, line) => { lines.push(line); });
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(lines.some(l => l.includes("ok"))).toBe(true);
    await spawner.stop();
  });

  it("works without options (backward compatible)", async () => {
    const spawner = createProcessSpawner("echo compat");
    const lines: string[] = [];
    await spawner.start((_source, line) => { lines.push(line); });
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(lines.some(l => l.includes("compat"))).toBe(true);
    await spawner.stop();
  });

  it("reports not connected after process exits", async () => {
    const spawner = createProcessSpawner("echo done", { cwd: "/tmp" });
    await spawner.start(() => {});
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(spawner.isConnected()).toBe(false);
  });
});
