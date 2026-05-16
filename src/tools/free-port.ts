/**
 * MCP tool handler for free_port - kills process occupying a port.
 *
 * When start_server fails because a port is in use (from a crashed
 * previous session), agents need a way to free it without falling
 * back to shell ("lsof -ti:PORT | xargs kill").
 *
 * @see docs/feedback/agent-feedback-log.md "start_server crash loop"
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "node:child_process";
import { createConnection } from "node:net";
import { jsonResult, errorResult } from "@/mcp/response-helpers.js";

/**
 * Check if a port is in use by attempting a TCP connection.
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { resolve(false); });
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

/**
 * Handle free_port tool call.
 *
 * Checks if the port is in use, finds the PID, kills it.
 * Only works on Unix (lsof). Returns clear status.
 *
 * @param args - { port: number }
 */
export async function handleFreePort(args: Record<string, unknown>): Promise<CallToolResult> {
  const port = args.port as number | undefined;
  if (!port) return errorResult("port parameter is required (e.g., free_port({ port: 8080 }))");

  const inUse = await isPortInUse(port);
  if (!inUse) {
    return jsonResult({ status: "already_free", port, message: `Port ${port} is not in use.` });
  }

  // Find and kill the process
  try {
    const pid = execSync(`lsof -ti:${port} 2>/dev/null`, { encoding: "utf-8" }).trim();
    if (pid) {
      execSync(`kill -9 ${pid} 2>/dev/null`);
      return jsonResult({
        status: "freed",
        port,
        killed_pid: parseInt(pid, 10),
        message: `Killed process ${pid} on port ${port}.`,
      });
    }
  } catch {
    // lsof not available or kill failed
  }

  return jsonResult({
    status: "in_use",
    port,
    message: `Port ${port} is in use but could not identify/kill the process. Try manually: lsof -ti:${port} | xargs kill -9`,
  });
}
