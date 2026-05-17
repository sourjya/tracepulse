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
import { execFileSync } from "node:child_process";
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

  // Security: validate port is a finite integer in valid range (prevents command injection)
  const portNum = Number(port);
  if (!Number.isFinite(portNum) || !Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return errorResult("port must be an integer between 1 and 65535");
  }

  const inUse = await isPortInUse(portNum);
  if (!inUse) {
    return jsonResult({ status: "already_free", port: portNum, message: `Port ${portNum} is not in use.` });
  }

  // Find and kill the process using execFileSync (no shell interpretation)
  try {
    const output = execFileSync("lsof", ["-ti", `:${portNum}`], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (output) {
      // lsof can return multiple PIDs (one per line) if multiple processes listen on the port
      const pids = output.split("\n").map(p => p.trim()).filter(Boolean);
      const killed: number[] = [];
      for (const pid of pids) {
        try {
          execFileSync("kill", ["-9", pid], { stdio: ["pipe", "pipe", "pipe"] });
          killed.push(parseInt(pid, 10));
        } catch { /* process may have already exited */ }
      }
      return jsonResult({
        status: "freed",
        port: portNum,
        killed_pids: killed,
        message: `Killed ${killed.length} process(es) on port ${portNum}: ${killed.join(", ")}`,
      });
    }
  } catch {
    // lsof not available or no process found
  }

  return jsonResult({
    status: "in_use",
    port: portNum,
    message: `Port ${portNum} is in use but could not identify/kill the process. Try manually: lsof -ti:${portNum} | xargs kill -9`,
  });
}
