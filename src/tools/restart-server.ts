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

/** Restart callback set by the CLI when in start mode. */
export type RestartFn = () => Promise<{ success: boolean; message: string }>;

/**
 * Handle restart_server MCP tool call.
 *
 * @param restartFn - Callback that kills and respawns the server. null in attach mode.
 */
export async function handleRestartServer(
  restartFn: RestartFn | null,
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

  const result = await restartFn();
  return {
    content: [{
      type: "text",
      text: JSON.stringify(result),
    }],
  };
}
