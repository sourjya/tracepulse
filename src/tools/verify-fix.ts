/**
 * MCP tool handler for verify_fix.
 *
 * Composite tool that combines watch_for_errors + get_build_errors + get_errors
 * into a single "did my fix work?" response. Saves 3 tool calls per fix cycle.
 *
 * Supports claim-checking: pass a fingerprint to verify that a specific error
 * is gone. The verdict includes whether the claimed fix actually resolved the
 * target error, not just whether zero new errors appeared.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for verify_fix design
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import { watchForErrors } from "@/watch/watch-controller.js";
import { DEFAULT_WATCH_DURATION_SECONDS } from "@/constants/watch.js";

/**
 * Handle verify_fix MCP tool call.
 *
 * Watches for errors, checks build errors, and optionally verifies that
 * a specific fingerprint is no longer recurring.
 *
 * @param buffer - Event buffer.
 * @param args - { duration_seconds?: number, fingerprint?: string }.
 * @param isAttachMode - Whether running in attach mode (affects hot_reload_detected).
 * @returns Composite verification result with pass/fail verdict.
 */
export async function handleVerifyFix(
  buffer: EventBuffer,
  args: Record<string, unknown>,
  isAttachMode?: boolean,
): Promise<CallToolResult> {
  const duration = (args.duration_seconds as number | undefined) ?? DEFAULT_WATCH_DURATION_SECONDS;
  const targetFingerprint = args.fingerprint as string | undefined;

  // Snapshot the target error's occurrence count before watching
  let priorOccurrences: number | undefined;
  if (targetFingerprint) {
    const existing = buffer.query({ level: "error" })
      .find((e) => e.fingerprint === targetFingerprint);
    priorOccurrences = existing?.occurrence_count;
  }

  try {
    const watchResult = await watchForErrors(buffer, duration, undefined, isAttachMode);

    const buildErrors = buffer.query({ source: "build-error" });
    const allErrors = buffer.query({ level: "error" });

    // Check if the target fingerprint recurred during the watch window
    let claimResult: Record<string, unknown> | undefined;
    if (targetFingerprint) {
      const recurred = watchResult.events.some((e) => e.fingerprint === targetFingerprint);
      const stillInBuffer = allErrors.some((e) => e.fingerprint === targetFingerprint);
      claimResult = {
        fingerprint: targetFingerprint,
        recurred_during_watch: recurred,
        still_in_buffer: stillInBuffer,
        prior_occurrences: priorOccurrences ?? 0,
        resolved: !recurred,
      };
    }

    const pass = watchResult.events.length === 0 && buildErrors.length === 0;
    const claimResolved = claimResult ? !claimResult.recurred_during_watch : undefined;

    // Verdict considers both general health and specific claim
    const finalVerdict = targetFingerprint
      ? (pass && claimResolved ? "PASS" : "FAIL")
      : (pass ? "PASS" : "FAIL");

    // Build summary message
    let summary: string;
    if (finalVerdict === "PASS") {
      summary = targetFingerprint
        ? `Fix verified: target error resolved (was ${priorOccurrences ?? 0} occurrences), zero new errors in ${duration}s.`
        : `Fix verified: zero new errors in ${duration}s, no build errors, ${allErrors.length} total in buffer.`;
    } else {
      const parts: string[] = [];
      if (watchResult.events.length > 0) parts.push(`${watchResult.events.length} new errors`);
      if (buildErrors.length > 0) parts.push(`${buildErrors.length} build errors`);
      if (claimResult?.recurred_during_watch) parts.push("target error recurred");
      summary = `Issues found: ${parts.join(", ")}.`;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            verdict: finalVerdict,
            summary,
            ...(claimResult ? { claim: claimResult } : {}),
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
