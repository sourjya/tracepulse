/**
 * MCP tool handler for check_port.
 *
 * Quick TCP check if a port is available (nothing listening) or in use.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { connect } from "node:net";

export async function handleCheckPort(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const port = args.port as number | undefined;
  if (!port) {
    return { content: [{ type: "text", text: "port parameter is required" }], isError: true };
  }

  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(1000);

    socket.on("connect", () => {
      socket.destroy();
      resolve({
        content: [{
          type: "text",
          text: JSON.stringify({ port, status: "in_use", message: `Port ${port} is in use (something is listening)` }),
        }],
      });
    });

    socket.on("error", () => {
      resolve({
        content: [{
          type: "text",
          text: JSON.stringify({ port, status: "available", message: `Port ${port} is available` }),
        }],
      });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        content: [{
          type: "text",
          text: JSON.stringify({ port, status: "available", message: `Port ${port} is available (timeout)` }),
        }],
      });
    });
  });
}
