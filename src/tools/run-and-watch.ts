/**
 * MCP tool handler for run_and_watch.
 *
 * Spawns a command, pipes output through the parser pipeline, waits for
 * exit, returns structured results. Replaces: shell command + manual log reading.
 *
 * Use cases: run tests, run type checker, run linter, run any command
 * and get parsed, scored results back.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { RuntimeEvent } from "@/types/events.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createDefaultRegistry } from "@/pipeline/parser-registry.js";
import { redact } from "@/pipeline/secret-redactor.js";
import { normalizeEvent, normalizeRawLine } from "@/pipeline/event-normalizer.js";
import { ANSI_ESCAPE_REGEX, MAX_PARSE_INPUT_LENGTH } from "@/constants/limits.js";

/**
 * Handle run_and_watch MCP tool call.
 *
 * @param args - { command: string, timeout_seconds?: number }.
 */
export async function handleRunAndWatch(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const command = args.command as string | undefined;
  if (!command) {
    return { content: [{ type: "text", text: "command parameter is required" }], isError: true };
  }

  const timeout = ((args.timeout_seconds as number | undefined) ?? 60) * 1000;
  const tempBuffer = createRingBuffer(200);
  const registry = createDefaultRegistry();

  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;

    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1", FORCE_COLOR: "0" },
    });

    /** Process a line through the parser pipeline into the temp buffer. */
    function processLine(line: string, source: "server-stdout" | "server-stderr"): void {
      const stripped = line.replace(ANSI_ESCAPE_REGEX, "");
      const redacted = redact(stripped);
      const parseInput = redacted.length > MAX_PARSE_INPUT_LENGTH
        ? redacted.slice(0, MAX_PARSE_INPUT_LENGTH) : redacted;
      const parsed = registry.parse(parseInput);
      const event = parsed
        ? normalizeEvent(parsed, redacted, source, true)
        : normalizeRawLine(redacted, source);
      tempBuffer.push(event);
    }

    if (child.stdout) {
      createInterface({ input: child.stdout }).on("line", (l) => processLine(l, "server-stdout"));
    }
    if (child.stderr) {
      createInterface({ input: child.stderr }).on("line", (l) => processLine(l, "server-stderr"));
    }

    function finish(exitCode: number | null): void {
      if (resolved) return;
      resolved = true;

      const allEvents = tempBuffer.query({});
      const errors = allEvents.filter((e) => e.level === "error" || e.level === "warn");

      resolve({
        content: [{
          type: "text",
          text: JSON.stringify({
            exit_code: exitCode,
            success: exitCode === 0,
            duration_ms: Date.now() - startTime,
            total_events: allEvents.length,
            error_count: errors.length,
            errors: errors.slice(0, 10),
            summary: exitCode === 0
              ? `Command succeeded in ${Date.now() - startTime}ms, ${errors.length} warnings`
              : `Command failed (exit ${exitCode}) in ${Date.now() - startTime}ms, ${errors.length} errors`,
          }),
        }],
      });
    }

    child.on("exit", (code) => finish(code));
    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      resolve({
        content: [{ type: "text", text: `Failed to run command: ${err.message}` }],
        isError: true,
      });
    });

    const timer = setTimeout(() => {
      if (resolved) return;
      try { child.kill("SIGTERM"); } catch {}
      finish(null);
    }, timeout);

    if (typeof timer === "object" && "unref" in timer) timer.unref();
  });
}
