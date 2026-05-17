/**
 * MCP tool handler for wait_for_build.
 *
 * Event-driven: blocks until the next build/hot-reload event, then returns
 * the build result with any errors. Replaces time-based polling.
 */

import { MAX_TRUNCATED_LIST } from "@/constants/limits.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { RuntimeEvent } from "@/types/events.js";

export async function handleWaitForBuild(
  buffer: EventBuffer,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const timeout = ((args.timeout_seconds as number | undefined) ?? 30) * 1000;

  return new Promise((resolve) => {
    let resolved = false;
    const startTime = Date.now();

    const unsubscribe = buffer.subscribe((event: RuntimeEvent) => {
      if (resolved) return;
      if (!event.fingerprint.startsWith("hotreload:")) return;

      // Build event arrived
      resolved = true;
      unsubscribe();

      // Check for build errors that arrived around the same time
      const buildErrors = buffer.query({ source: "build-error" });

      resolve({
        content: [{
          type: "text",
          text: JSON.stringify({
            status: buildErrors.length > 0 ? "failed" : "success",
            build_tool: event.context.framework ?? "unknown",
            duration_ms: Date.now() - startTime,
            build_errors: buildErrors.slice(0, MAX_TRUNCATED_LIST),
            build_error_count: buildErrors.length,
            last_build_at: event.timestamp,
          }),
        }],
      });
    });

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      unsubscribe();

      resolve({
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "timed_out",
            duration_ms: Date.now() - startTime,
            message: `No build event detected in ${timeout / 1000}s. The dev server may not have reloaded.`,
            last_build_at: buffer.lastBuildAt,
          }),
        }],
      });
    }, timeout);

    if (typeof timer === "object" && "unref" in timer) timer.unref();
  });
}
