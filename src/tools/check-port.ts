/**
 * MCP tool handler for check_port (supports single and bulk).
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { connect } from "node:net";

function probePort(port: number): Promise<{ port: number; status: string; message: string }> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.on("connect", () => { socket.destroy(); resolve({ port, status: "in_use", message: `Port ${port} is in use` }); });
    socket.on("error", () => { resolve({ port, status: "available", message: `Port ${port} is available` }); });
    socket.on("timeout", () => { socket.destroy(); resolve({ port, status: "available", message: `Port ${port} is available` }); });
  });
}

export async function handleCheckPort(args: Record<string, unknown>): Promise<CallToolResult> {
  const port = args.port as number | undefined;
  const ports = args.ports as number[] | undefined;

  const portList = ports ?? (port ? [port] : []);
  if (portList.length === 0) {
    return { content: [{ type: "text", text: "port or ports parameter is required" }], isError: true };
  }

  const results = await Promise.all(portList.map(probePort));
  const inUse = results.filter((r) => r.status === "in_use").length;

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        results,
        summary: `${inUse}/${results.length} port(s) in use`,
      }),
    }],
  };
}
