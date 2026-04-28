/**
 * MCP tool handler for verify_fix.
 *
 * Composite tool that combines watch_for_errors + get_build_errors + get_errors
 * into a single "did my fix work?" response. Saves 3 tool calls per fix cycle.
 *
 * Agent requested this: "After fixing a bug, I want a single tool call that says
 * 'your fix worked - zero errors, build clean, no regressions.'"
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import { watchForErrors } from "@/watch/watch-controller.js";
import { DEFAULT_WATCH_DURATION_SECONDS } from "@/constants/watch.js";

/**
 * Handle verify_fix MCP tool call.
 *
 * Watches for errors, then checks build errors and total errors.
 * Returns a single pass/fail verdict with details.
 *
 * @param buffer - Event buffer.
 * @param args - { duration_seconds?: number }.
 * @returns Composite verification result.
 */
export async function handleVerifyFix(
  buffer: EventBuffer,
  args: Record<string, unknown>,
  isAttachMode?: boolean,
): Promise<CallToolResult> {
  const duration = (args.duration_seconds as number | undefined) ?? DEFAULT_WATCH_DURATION_SECONDS;

  try {
    const watchResult = await watchForErrors(buffer, duration, undefined, isAttachMode);

    const buildErrors = buffer.query({ source: "build-error" });
    const allErrors = buffer.query({ level: "error" });

    const pass = watchResult.events.length === 0 && buildErrors.length === 0;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            verdict: pass ? "PASS" : "FAIL",
            summary: pass
              ? `Fix verified: zero new errors in ${duration}s, no build errors, ${allErrors.length} total errors in buffer.`
              : `Issues found: ${watchResult.events.length} new errors, ${buildErrors.length} build errors.`,
            watch: {
              new_errors: watchResult.events.length,
              hot_reload_detected: watchResult.hot_reload_detected,
              total_events_seen: watchResult.total_events_seen,
              duration_ms: watchResult.watch_duration_ms,
            },
            build_errors: buildErrors.length,
            total_errors_in_buffer: allErrors.length,
            last_build_at: buffer.lastBuildAt,
            new_error_details: watchResult.events.slice(0, 3),
          }),
        },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    };
  }
}
