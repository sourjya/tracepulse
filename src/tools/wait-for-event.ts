/**
 * MCP tool handler for wait_for_event.
 *
 * Generic event-driven blocking: waits for the next event matching a type
 * filter and returns it immediately.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { RuntimeEvent } from "@/types/events.js";

/** Event type filters. */
const TYPE_MATCHERS: Record<string, (e: RuntimeEvent) => boolean> = {
  error: (e) => e.level === "error",
  warning: (e) => e.level === "warn",
  build: (e) => e.fingerprint.startsWith("hotreload:"),
  crash: (e) => e.fingerprint === "crashloop:detected" || e.message.includes("Process exited"),
  any: () => true,
};

export async function handleWaitForEvent(
  buffer: EventBuffer,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const type = (args.type as string | undefined) ?? "any";
  const timeout = ((args.timeout_seconds as number | undefined) ?? 30) * 1000;
  const matcher = TYPE_MATCHERS[type];

  if (!matcher) {
    return {
      content: [{ type: "text", text: `Invalid type. Must be one of: ${Object.keys(TYPE_MATCHERS).join(", ")}` }],
      isError: true,
    };
  }

  return new Promise((resolve) => {
    let resolved = false;
    const startTime = Date.now();

    const unsubscribe = buffer.subscribe((event: RuntimeEvent) => {
      if (resolved) return;
      if (!matcher(event)) return;

      resolved = true;
      unsubscribe();

      resolve({
        content: [{
          type: "text",
          text: JSON.stringify({
            matched: true,
            event_type: type,
            wait_duration_ms: Date.now() - startTime,
            event,
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
            matched: false,
            event_type: type,
            wait_duration_ms: Date.now() - startTime,
            message: `No ${type} event in ${timeout / 1000}s`,
          }),
        }],
      });
    }, timeout);

    if (typeof timer === "object" && "unref" in timer) timer.unref();
  });
}
