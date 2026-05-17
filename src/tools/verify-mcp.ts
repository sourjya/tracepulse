/**
 * MCP tool handler for verify_mcp.
 *
 * Sends the MCP initialize JSON-RPC handshake to a command's stdin,
 * reads the response from stdout, and returns structured pass/fail.
 * This verifies that an MCP server starts correctly and responds to
 * the protocol — the same handshake Kiro/Claude/Cursor sends on connect.
 *
 * @see https://modelcontextprotocol.io/specification/2024-11-05/basic/lifecycle
 */

import { spawn } from "node:child_process";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Default timeout for the handshake (seconds). */
const DEFAULT_TIMEOUT_SECONDS = 5;

/** Maximum timeout allowed. */
const MAX_TIMEOUT_SECONDS = 30;

/**
 * Build the MCP initialize JSON-RPC message.
 * This is the exact message MCP clients send on connection.
 */
export function buildInitializeMessage(): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "tracepulse-verify", version: "1.0" },
    },
  });
}

/**
 * Handle verify_mcp MCP tool call.
 *
 * Spawns the given command, pipes the initialize handshake to stdin,
 * reads the first line of stdout, and validates it as a JSON-RPC response
 * with serverInfo.
 *
 * @param args - Tool input: { command, timeout_seconds? }
 * @returns Structured result with server info or failure details.
 */
export async function handleVerifyMcp(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const command = args.command as string | undefined;
  if (!command || typeof command !== "string") {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "command is required" }) }],
      isError: true,
    };
  }

  // Security: reject shell metacharacters (SRR-006 M-003)
  const SHELL_META = /[;&|`$(){}!<>]/;
  if (SHELL_META.test(command)) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Command contains shell metacharacters which are not allowed. MCP server commands should be simple (e.g., 'node dist/cli.js')." }) }],
      isError: true,
    };
  }

  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
  if (args.timeout_seconds !== undefined) {
    const t = Number(args.timeout_seconds);
    if (!isNaN(t) && t > 0 && t <= MAX_TIMEOUT_SECONDS) {
      timeoutSeconds = t;
    }
  }

  const initMessage = buildInitializeMessage();

  try {
    const response = await spawnAndHandshake(command, initMessage, timeoutSeconds);
    return { content: [{ type: "text", text: JSON.stringify(response) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: message, command }) }],
    };
  }
}

/** Result of a successful MCP handshake. */
interface HandshakeResult {
  readonly success: boolean;
  readonly server_name?: string;
  readonly server_version?: string;
  readonly protocol_version?: string;
  readonly capabilities?: Record<string, unknown>;
  readonly duration_ms?: number;
  readonly error?: string;
  readonly command?: string;
}

/**
 * Spawn a command, send the initialize message, and parse the response.
 *
 * Uses shell: true to support compound commands (e.g., "uv run python -m app").
 * Kills the process after receiving the first response line or on timeout.
 */
function spawnAndHandshake(
  command: string,
  initMessage: string,
  timeoutSeconds: number,
): Promise<HandshakeResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let resolved = false;

    const child = spawn(command, {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill("SIGKILL");
        resolve({ success: false, error: `timeout after ${timeoutSeconds}s — server did not respond to initialize`, command });
      }
    }, timeoutSeconds * 1000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      // Look for a complete JSON line (first newline or end of valid JSON)
      const firstLine = stdout.split("\n")[0];
      if (firstLine && !resolved) {
        try {
          const resp = JSON.parse(firstLine);
          resolved = true;
          clearTimeout(timer);
          child.kill("SIGTERM");

          // Validate JSON-RPC response structure
          if (resp.id !== 1 || !resp.result) {
            resolve({ success: false, error: "Invalid JSON-RPC response: missing id=1 or result field", command });
            return;
          }

          const result = resp.result;
          const serverInfo = result.serverInfo;
          if (!serverInfo) {
            resolve({ success: false, error: "Invalid initialize response: missing serverInfo", command });
            return;
          }

          resolve({
            success: true,
            server_name: serverInfo.name,
            server_version: serverInfo.version,
            protocol_version: result.protocolVersion,
            capabilities: result.capabilities,
            duration_ms: Date.now() - startTime,
          });
        } catch {
          // Not valid JSON yet — might need more data, or it's garbage
          // Wait a bit more, but if we have a newline it's definitely done
          if (stdout.includes("\n")) {
            resolved = true;
            clearTimeout(timer);
            child.kill("SIGTERM");
            resolve({ success: false, error: `Failed to parse server response as JSON: ${firstLine.slice(0, 200)}`, command });
          }
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ success: false, error: `Failed to spawn command: ${err.message}`, command });
      }
    });

    child.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        if (code !== 0 && !stdout) {
          resolve({
            success: false,
            error: `Command exited with code ${code}${stderr ? `: ${stderr.slice(0, 200)}` : ""}`,
            command,
          });
        } else if (!stdout) {
          resolve({ success: false, error: "Command produced no output", command });
        }
        // If we have stdout but haven't parsed it yet, try one more time
        const firstLine = stdout.split("\n")[0];
        if (firstLine) {
          try {
            const resp = JSON.parse(firstLine);
            if (resp.id === 1 && resp.result?.serverInfo) {
              resolve({
                success: true,
                server_name: resp.result.serverInfo.name,
                server_version: resp.result.serverInfo.version,
                protocol_version: resp.result.protocolVersion,
                capabilities: resp.result.capabilities,
                duration_ms: Date.now() - startTime,
              });
              return;
            }
          } catch { /* fall through */ }
          resolve({ success: false, error: `Failed to parse server response as JSON: ${firstLine.slice(0, 200)}`, command });
        }
      }
    });

    // Send the initialize message to stdin, then close stdin
    // Ignore EPIPE errors (process may exit before we finish writing)
    child.stdin.on("error", () => { /* ignore EPIPE */ });
    child.stdin.write(initMessage + "\n");
    child.stdin.end();
  });
}
