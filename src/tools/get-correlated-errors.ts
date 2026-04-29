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

  const result: Record<string, unknown> = { correlations };
  if (correlations.length === 0) {
    result.diagnostics = frontendErrors.length === 0
      ? "No frontend errors in buffer. No browser-side error source is configured. Use Chrome DevTools MCP list_console_messages(types: ['error']) to check browser errors directly, or inject the error catcher from skills/browser-errors/SKILL.md."
      : `${frontendErrors.length} frontend error(s) found but none matched backend errors. Try get_errors(message_contains: '/path') to search backend logs directly.`;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result),
      },
    ],
  };
}
