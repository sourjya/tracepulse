/**
 * MCP tool handler for restart_server.
 *
 * Kills the current dev server process and respawns it with the same command.
 * Only works in start mode (TracePulse owns the process).
 * Language-agnostic - works with any command that was passed to `tracepulse start`.
 *
 * Examples:
 *   tracepulse start "npm run dev"        -> restarts Node.js
 *   tracepulse start "python manage.py"   -> restarts Django
 *   tracepulse start "go run main.go"     -> restarts Go
 *   tracepulse start "cargo run"          -> restarts Rust
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";

/** Restart callback set by the CLI when in start mode. */
export type RestartFn = () => Promise<{ success: boolean; message: string }>;

const RESTART_COOLDOWN_MS = 5000;
let lastRestartAt = 0;

/**
 * Handle restart_server MCP tool call.
 * Auto-clears the error buffer on successful restart.
 */
export async function handleRestartServer(
  restartFn: RestartFn | null,
  buffer?: EventBuffer,
): Promise<CallToolResult> {
  if (!restartFn) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          message: "restart_server only works in start mode. In attach mode, TracePulse doesn't own the server process - restart it manually or via your process manager.",
        }),
      }],
      isError: true,
    };
  }

  // Cooldown to prevent restart loops
  const elapsed = Date.now() - lastRestartAt;
  if (elapsed < RESTART_COOLDOWN_MS) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          message: `Restart cooldown: wait ${Math.ceil((RESTART_COOLDOWN_MS - elapsed) / 1000)}s before restarting again.`,
        }),
      }],
      isError: true,
    };
  }
  lastRestartAt = Date.now();

  const result = await restartFn();
  const cleared = buffer ? buffer.clear() : 0;
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ ...result, cleared_errors: cleared }),
    }],
  };
}
