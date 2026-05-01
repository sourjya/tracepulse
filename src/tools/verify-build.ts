/**
 * MCP tool handler for verify_build.
 *
 * Composite tool that runs type checker + build + runtime error check
 * in one call. Replaces the agent's most common 3-call sequence:
 *   run_and_watch("npx tsc --noEmit") -> run_and_watch("npx vite build") -> verify_fix()
 *
 * Saves 2 tool calls per verification cycle. At 15+ cycles per session,
 * that's 30+ tool calls saved.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for composite tool design
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import { handleRunAndWatch } from "@/tools/run-and-watch.js";
import { watchForErrors } from "@/watch/watch-controller.js";

/**
 * Handle verify_build MCP tool call.
 *
 * Runs type checker, then build, then watches for runtime errors.
 * Stops early if any step fails. Returns a unified verdict.
 *
 * @param buffer - Event buffer for runtime error check.
 * @param args - { typecheck_command?, build_command?, cwd?, duration_seconds? }.
 * @param isAttachMode - Whether running in attach mode.
 * @returns Unified pass/fail verdict with details from all three steps.
 */
export async function handleVerifyBuild(
  buffer: EventBuffer,
  args: Record<string, unknown>,
  isAttachMode?: boolean,
): Promise<CallToolResult> {
  const cwd = args.cwd as string | undefined;
  const typecheckCmd = (args.typecheck_command as string | undefined) ?? "npx tsc --noEmit";
  const buildCmd = (args.build_command as string | undefined) ?? "npx vite build";
  const duration = (args.duration_seconds as number | undefined) ?? 3;

  const steps: Array<{ step: string; pass: boolean; detail: string }> = [];

  // Step 1: Type check
  const tscResult = await handleRunAndWatch({ command: typecheckCmd, timeout_seconds: 30, cwd });
  const tscData = JSON.parse((tscResult.content[0] as { text: string }).text);
  const tscPass = tscData.success && tscData.error_count === 0;
  steps.push({
    step: "typecheck",
    pass: tscPass,
    detail: tscPass ? `Clean in ${tscData.duration_ms}ms` : `${tscData.error_count} errors`,
  });

  // Stop early if typecheck fails
  if (!tscPass) {
    return result("FAIL", steps, tscData.errors?.slice(0, 3));
  }

  // Step 2: Build
  const buildResult = await handleRunAndWatch({ command: buildCmd, timeout_seconds: 30, cwd });
  const buildData = JSON.parse((buildResult.content[0] as { text: string }).text);
  const buildPass = buildData.success;
  steps.push({
    step: "build",
    pass: buildPass,
    detail: buildPass ? `Built in ${buildData.duration_ms}ms` : `Build failed (exit ${buildData.exit_code})`,
  });

  if (!buildPass) {
    return result("FAIL", steps, buildData.errors?.slice(0, 3));
  }

  // Step 3: Runtime error check
  const watchResult = await watchForErrors(buffer, duration, undefined, isAttachMode);
  const runtimePass = watchResult.events.length === 0;
  steps.push({
    step: "runtime",
    pass: runtimePass,
    detail: runtimePass
      ? `Zero errors in ${duration}s, ${watchResult.total_events_seen} events seen`
      : `${watchResult.events.length} new errors`,
  });

  return result(
    runtimePass ? "PASS" : "FAIL",
    steps,
    runtimePass ? undefined : watchResult.events.slice(0, 3),
  );
}

/** Build the unified result object. */
function result(
  verdict: "PASS" | "FAIL",
  steps: Array<{ step: string; pass: boolean; detail: string }>,
  errors?: unknown[],
): CallToolResult {
  const summary = steps.map((s) => `${s.step}: ${s.pass ? "OK" : "FAIL"} (${s.detail})`).join(", ");
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        verdict,
        summary,
        steps,
        ...(errors && errors.length > 0 ? { errors } : {}),
      }),
    }],
  };
}
