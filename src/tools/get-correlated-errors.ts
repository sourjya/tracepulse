/**
 * MCP tool handler for get_correlated_errors.
 *
 * Reads from both the backend event buffer and frontend error buffer,
 * runs the correlation engine, and returns matched pairs.
 *
 * @see src/correlation/fe-be-correlation.ts for the correlation algorithm
 * @see .kiro/specs/phase4-correlation/design.md for tool contract
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { FrontendErrorBuffer } from "@/correlation/frontend-error-buffer.js";
import { correlateFrontendBackend } from "@/correlation/fe-be-correlation.js";

/**
 * Handle get_correlated_errors MCP tool call.
 *
 * @param backendBuffer - Backend event buffer.
 * @param frontendBuffer - Frontend error buffer.
 * @param args - Tool input: { url?: string }.
 * @returns MCP CallToolResult with correlated error pairs.
 */
export function handleGetCorrelatedErrors(
  backendBuffer: EventBuffer,
  frontendBuffer: FrontendErrorBuffer,
  args: Record<string, unknown>,
): CallToolResult {
  const urlFilter = args.url as string | undefined;

  // Get frontend errors (optionally filtered by URL)
  const frontendErrors = urlFilter
    ? frontendBuffer.getByUrl(urlFilter)
    : frontendBuffer.getAll();

  // Get backend error/warn events
  const backendEvents = backendBuffer.query({ level: "warn" });

  const correlations = correlateFrontendBackend(frontendErrors, backendEvents);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ correlations }),
      },
    ],
  };
}
