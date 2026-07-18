/**
 * Tool-call telemetry middleware.
 *
 * Wraps an MCP tool handler so every invocation is recorded to the audit buffer
 * (token/latency accounting) and the event journal. Without this, `auditBuffer.record`
 * and `journalToolCall` are never called on the live path, so `get_session_impact`,
 * `get_audit_trail`, and the journal rollup all read empty and report zeros.
 *
 * Telemetry is best-effort: a failure here must never break the underlying tool call.
 *
 * @see docs/research/telemetry-savings-measurement.md (TRP-73)
 * @see TRP-78
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuditBuffer } from "@/store/audit-buffer.js";

/** Sinks the middleware feeds. `journalBridge` is optional (persistence may be off). */
export interface ToolTelemetrySinks {
  readonly auditBuffer: AuditBuffer;
  readonly journalBridge?: { journalToolCall(tool: string, fingerprint?: string): void };
}

/** Concatenate the text content of a tool result (for a rough token estimate). */
export function extractResultText(result: CallToolResult | undefined): string {
  const content = result?.content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const part of content) {
    const t = (part as { text?: unknown }).text;
    if (typeof t === "string") text += t;
  }
  return text;
}

/** Estimate response tokens from a result's text (~4 chars/token). */
export function estimateResponseTokens(result: CallToolResult | undefined): number {
  return Math.ceil(extractResultText(result).length / 4);
}

/**
 * Wrap a tool handler so its invocation is recorded to the telemetry sinks.
 *
 * The wrapper preserves the handler's signature and return value. If the handler
 * throws, the error propagates and nothing is recorded (a failed call is not a
 * response). Recording itself is wrapped in try/catch so telemetry can never break
 * a successful tool call.
 *
 * @param toolName - MCP tool name (audit/journal key).
 * @param handler - The original tool handler.
 * @param sinks - Audit buffer + optional journal bridge.
 * @param now - Clock injection point (defaults to Date.now) for deterministic tests.
 */
export function instrumentHandler<A extends unknown[]>(
  toolName: string,
  handler: (...args: A) => CallToolResult | Promise<CallToolResult>,
  sinks: ToolTelemetrySinks,
  now: () => number = Date.now,
): (...args: A) => Promise<CallToolResult> {
  return async (...args: A): Promise<CallToolResult> => {
    const start = now();
    const result = await handler(...args);
    try {
      const params = (args[0] ?? {}) as Record<string, unknown>;
      sinks.auditBuffer.record({
        tool: toolName,
        params: typeof params === "object" && params !== null ? params : {},
        response_tokens: estimateResponseTokens(result),
        duration_ms: Math.max(0, now() - start),
        timestamp: start,
      });
      sinks.journalBridge?.journalToolCall(toolName);
    } catch {
      /* telemetry is best-effort — never break the tool call */
    }
    return result;
  };
}
