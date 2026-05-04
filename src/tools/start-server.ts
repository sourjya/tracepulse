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
import { jsonResult, errorResult } from "@/mcp/response-helpers.js";
import { diagnoseStartupFailure } from "@/diagnostics/startup-diagnostics.js";

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
// Shell syntax detection (pre-spawn validation)
// ──────────────────────────────────────────────

/** Patterns that indicate shell syntax in a command. */
const SHELL_ENV_PATTERN = /^[A-Z_]+=\S+\s/;
const SHELL_META = /[;&|`$(){}!<>]/;

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

  if (!command) {
    return errorResult("command parameter is required. Example: start_server({ command: 'npm run dev' })");
  }

  // Check if already running
  if (manager.isRunning(name)) {
    const pid = manager.getPid(name);
    return errorResult(`Server "${name}" already running (PID ${pid}). Call stop_server() first, or restart_server().`);
  }

  // Pre-spawn validation: detect shell syntax before attempting to spawn
  const diagnostics: Array<{ issue: string; fix: string }> = [];

  if (SHELL_ENV_PATTERN.test(command)) {
    const match = command.match(/^([A-Z_]+=\S+)\s+(.*)/);
    if (match) {
      diagnostics.push({
        issue: `"${match[1]}" is shell syntax. TracePulse spawns processes directly, not through a shell.`,
        fix: `Pass env parameter instead: start_server({ command: "${match[2]}", env: { "${match[1].split("=")[0]}": "${match[1].split("=")[1]}" } })`,
      });
    }
  }

  if (SHELL_META.test(command)) {
    diagnostics.push({
      issue: `Command contains shell operators. TracePulse doesn't use a shell.`,
      fix: `Wrap in bash: start_server({ command: "bash -c '${command}'" }) or use cwd parameter instead of cd.`,
    });
  }

  if (diagnostics.length > 0) {
    return jsonResult({ status: "invalid", diagnostics });
  }

  // Command looks valid - return ready status
  // Actual spawning is done by the CLI layer which has access to the collector
  return jsonResult({
    status: "ready",
    command,
    name,
    hint: "Server will start. Call get_project_health() to check when ready.",
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
  manager.setStopped(name);

  return jsonResult({
    status: "stopped",
    name,
    pid,
    message: `Server "${name}" stopped.`,
  });
}
