/**
 * Shared MCP response helpers for tool handlers.
 *
 * Eliminates the `content: [{ type: "text", text: JSON.stringify(...) }]`
 * boilerplate repeated across 30+ tool handlers. All tool files should
 * import from here instead of constructing responses manually.
 *
 * @see src/mcp/server.ts for tool registration
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Wrap data as a JSON MCP tool response.
 *
 * @param data - Any JSON-serializable data.
 * @returns CallToolResult with JSON text content.
 */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

/**
 * Wrap an error message as an MCP tool error response.
 *
 * @param message - Error message string.
 * @returns CallToolResult with isError flag.
 */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
