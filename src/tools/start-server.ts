/**
 * MCP tool handlers for start_server and stop_server.
 *
 * Allows the agent to start a dev server mid-session (Layer 2 activation).
 * Pre-validates commands using startup diagnostics before spawning.
 * Tracks server state to prevent double-starts.
 *
 * @see .kiro/specs/m21-zero-config/requirements.md
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createConnection } from "node:net";
import { jsonResult, errorResult } from "@/mcp/response-helpers.js";
import { validateStartCommand } from "@/tools/start-server-validation.js";

/** TCP probe — resolves true if something is listening on the port. */
function isPortOccupied(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.setTimeout(800);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
  });
}

// ──────────────────────────────────────────────
// Server Manager
// ──────────────────────────────────────────────

/** Tracks the state of a managed dev server process. */
export interface ServerManager {
  /** Whether a server is currently running. */
  isRunning(name?: string): boolean;
  /** Get the PID of the running server. */
  getPid(name?: string): number | null;
  /** Mark a server as running. */
  setRunning(name: string, pid: number): void;
  /** Mark a server as stopped. */
  setStopped(name?: string): void;
  /** Callback invoked when start_server validates successfully. CLI layer spawns the process. */
  onSpawnRequest?: (command: string, env?: Record<string, string>, cwd?: string, name?: string) => Promise<{ pid: number } | { error: string }>;
  /** Callback invoked when stop_server is called. CLI layer kills the process. */
  onStopRequest?: (name: string) => Promise<{ success: boolean; message: string }>;
}

/**
 * Create a server manager for tracking process state.
 *
 * @returns ServerManager instance.
 */
export function createServerManager(): ServerManager {
  const servers = new Map<string, number>();

  return {
    isRunning(name = "main") { return servers.has(name); },
    getPid(name = "main") { return servers.get(name) ?? null; },
    setRunning(name: string, pid: number) { servers.set(name, pid); },
    setStopped(name = "main") { servers.delete(name); },
  };
}

// ──────────────────────────────────────────────
// Tool Handlers
// ──────────────────────────────────────────────

/**
 * Handle start_server tool call.
 *
 * Pre-validates the command for common issues (shell syntax, metacharacters),
 * checks if a server is already running, then returns status.
 * Actual process spawning is handled by the CLI layer after validation.
 *
 * @param manager - Server state manager.
 * @param args - { command, env?, cwd?, name? }
 * @returns Validation result or start confirmation.
 */
export async function handleStartServer(
  manager: ServerManager,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const command = args.command as string | undefined;
  const name = (args.name as string | undefined) ?? "main";
  const port = args.port as number | undefined;

  if (!command) {
    return errorResult("command parameter is required. Example: start_server({ command: 'npm run dev' })");
  }

  // Check if already running
  if (manager.isRunning(name)) {
    const pid = manager.getPid(name);
    return errorResult(`Server "${name}" already running (PID ${pid}). Call stop_server() first, or restart_server().`);
  }

  // Port pre-check: if the agent specified which port to use, verify it's free before spawning.
  // Prevents the crash-loop pattern where start_server is retried 5+ times against an occupied port.
  if (port !== undefined) {
    const occupied = await isPortOccupied(port);
    if (occupied) {
      return jsonResult({
        status: "port_in_use",
        port,
        hint: `Port ${port} is already in use. Call stop_server() if this is a TracePulse-managed server, or free_port(${port}) to kill whatever holds it.`,
        next_steps: [`stop_server()`, `free_port(${port})`],
      });
    }
  }

  // Pre-spawn validation: detect common issues before attempting to spawn
  const validation = validateStartCommand(command, args.cwd as string | undefined);
  if (!validation.valid) {
    return jsonResult({ status: "invalid", diagnostics: validation.diagnostics });
  }

  // Command looks valid - spawn if callback available, otherwise return ready
  if (manager.onSpawnRequest) {
    const env = args.env as Record<string, string> | undefined;
    const cwd = args.cwd as string | undefined;
    const wait = args.wait as boolean | undefined;
    const spawnResult = await manager.onSpawnRequest(command, env, cwd, name);

    if ("error" in spawnResult) {
      return jsonResult({
        status: "failed",
        error: spawnResult.error,
        command,
        name,
        hint: "Server failed to start. Use run_and_watch with the same command to see full error output. Do NOT fall back to shell.",
        next_steps: [
          `run_and_watch("${command.replace(/"/g, '\\"')}", timeout_seconds: 5${cwd ? `, cwd: "${cwd}"` : ""})`,
          "get_server_logs(level: 'error')",
        ],
      });
    }

    manager.setRunning(name, spawnResult.pid);

    // If wait=true, block briefly to confirm server stays up
    if (wait) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (!manager.isRunning(name)) {
        return jsonResult({
          status: "crashed",
          command,
          name,
          hint: "Server started but crashed within 3 seconds. Check get_server_logs() for errors.",
          next_steps: ["get_server_logs(level: 'error')", "check_port(port)"],
        });
      }
    }
    return jsonResult({
      status: "started",
      pid: spawnResult.pid,
      command,
      name,
      hint: "Server starting. Call wait_for_build() to block until ready, or get_server_logs() if issues.",
      next_steps: ["wait_for_build()", "get_server_logs(level: 'error')", "list_services()", "check_port()"],
    });
  }

  // No spawn callback (testing or not wired) - return ready status
  return jsonResult({
    status: "ready",
    command,
    name,
    hint: "Server will start. Call wait_for_build() to block until ready, or get_server_logs() if issues.",
    next_steps: ["wait_for_build()", "get_server_logs(level: 'error')", "list_services()", "check_port()"],
  });
}

/**
 * Handle stop_server tool call.
 *
 * @param manager - Server state manager.
 * @param args - { name? }
 * @returns Confirmation or error.
 */
export async function handleStopServer(
  manager: ServerManager,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const name = (args.name as string | undefined) ?? "main";

  if (!manager.isRunning(name)) {
    return errorResult(`No server "${name}" is running. Nothing to stop.`);
  }

  const pid = manager.getPid(name);

  // Kill the process via CLI callback if available
  if (manager.onStopRequest) {
    const result = await manager.onStopRequest(name);
    if (result.success) {
      manager.setStopped(name);
    }
    return jsonResult({ ...result, name, pid });
  }

  // No callback wired (testing or standalone) - just update state
  manager.setStopped(name);

  return jsonResult({
    status: "stopped",
    name,
    pid,
    message: `Server "${name}" stopped.`,
  });
}
