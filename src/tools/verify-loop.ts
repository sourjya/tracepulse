/**
 * Composite fix verification tool — verify_loop.
 *
 * Collapses 5-7 tool calls into one: checks for new errors, verifies pinned
 * fingerprints are gone, checks build status, and detects HMR. Returns a
 * confidence-scored verdict.
 *
 * The computeVerdict function is pure (no I/O) for testability.
 * The handleVerifyLoop function orchestrates the async data gathering.
 *
 * @see .kiro/specs/m26-intelligent-feedback/requirements.md Feature 1
 * @see Deep Research §6.1 — "highest leverage composite"
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import { jsonResult } from "@/mcp/response-helpers.js";
import { getPositiveNudge } from "@/analysis/positive-nudge.js";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Input data for the verdict computation (gathered by the handler). */
export interface VerifyLoopInput {
  /** What the agent claims to have fixed. */
  readonly claim: string;
  /** Errors that appeared after the fix timestamp. */
  readonly newErrors: ReadonlyArray<{ message: string; signal_score: number }>;
  /** Fingerprint the agent wants to verify is gone (optional). */
  readonly pinnedFingerprint?: string;
  /** Whether the pinned fingerprint is still in the buffer. */
  readonly pinnedStillPresent: boolean;
  /** Whether the build is clean (no build errors). */
  readonly buildClean: boolean;
  /** Whether a hot-reload was detected since the fix. */
  readonly hotReloadDetected: boolean;
}

/** Structured verification result with confidence scoring. */
export interface VerifyLoopResult {
  /** Whether the fix appears to have worked. */
  readonly verified: boolean;
  /** Confidence level based on evidence strength. */
  readonly confidence: "high" | "medium" | "low";
  /** Evidence supporting the verdict. */
  readonly evidence: {
    readonly new_error_count: number;
    readonly build_clean: boolean;
    readonly hot_reload_detected: boolean;
    readonly pinned_resolved: boolean;
  };
  /** Human-readable explanation of the verdict. */
  readonly explanation: string;
}

// ──────────────────────────────────────────────
// Pure verdict computation (testable without I/O)
// ──────────────────────────────────────────────

/**
 * Compute a verification verdict from gathered evidence.
 *
 * Confidence scoring:
 * - HIGH: all checks pass + pinned fingerprint confirmed gone + HMR detected
 * - MEDIUM: no new errors but can't confirm fingerprint or no HMR
 * - LOW: new errors appeared, build broken, or pinned fingerprint still present
 *
 * @param input - Evidence gathered from the event buffer and build state.
 * @returns Structured verdict with confidence and explanation.
 */
export function computeVerdict(input: VerifyLoopInput): VerifyLoopResult {
  const { newErrors, pinnedFingerprint, pinnedStillPresent, buildClean, hotReloadDetected } = input;

  const evidence = {
    new_error_count: newErrors.length,
    build_clean: buildClean,
    hot_reload_detected: hotReloadDetected,
    pinned_resolved: pinnedFingerprint ? !pinnedStillPresent : true,
  };

  // LOW confidence: something is clearly wrong
  if (newErrors.length > 0) {
    return {
      verified: false,
      confidence: "low",
      evidence,
      explanation: `${newErrors.length} new error(s) appeared after fix. Top: "${newErrors[0].message}"`,
    };
  }

  if (!buildClean) {
    return {
      verified: false,
      confidence: "low",
      evidence,
      explanation: "Build errors detected. Fix may have introduced syntax/type errors.",
    };
  }

  if (pinnedStillPresent) {
    return {
      verified: false,
      confidence: "low",
      evidence,
      explanation: `Pinned error (${pinnedFingerprint}) still present in buffer. Fix did not resolve it.`,
    };
  }

  // HIGH confidence: all evidence confirms the fix
  if (hotReloadDetected && evidence.pinned_resolved && pinnedFingerprint) {
    return {
      verified: true,
      confidence: "high",
      evidence,
      explanation: "Fix verified: no new errors, build clean, HMR detected, pinned error resolved.",
    };
  }

  // MEDIUM confidence: no failures but can't fully confirm
  return {
    verified: true,
    confidence: "medium",
    evidence,
    explanation: hotReloadDetected
      ? "No new errors and build clean. Could not confirm specific error resolved (no fingerprint pinned)."
      : "No new errors and build clean, but HMR not detected — server may not have reloaded yet.",
  };
}

// ──────────────────────────────────────────────
// MCP Tool Handler
// ──────────────────────────────────────────────

/**
 * Handle verify_loop MCP tool call.
 *
 * Gathers evidence from the event buffer, then computes a verdict.
 * Blocks for up to timeout_seconds waiting for HMR before returning.
 *
 * @param buffer - Event buffer to check for new errors.
 * @param args - { claim, since?, fingerprint?, timeout_seconds? }
 * @returns Structured verdict with confidence scoring.
 */
export async function handleVerifyLoop(
  buffer: EventBuffer,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const claim = (args.claim as string) ?? "Fix applied";
  const since = (args.since as number) ?? Date.now() - 15000;
  const fingerprint = args.fingerprint as string | undefined;
  const timeout = Math.min(((args.timeout_seconds as number) ?? 10) * 1000, 30000);

  // Wait for potential HMR/reload
  await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 3000)));

  // Gather evidence
  const allEvents = buffer.query({ since, level: "warn" });
  const newErrors = allEvents
    .filter((e) => e.signal_score >= 20)
    .map((e) => ({ message: e.message, signal_score: e.signal_score }));

  const buildErrors = buffer.query({ since, level: "warn" })
    .filter((e) => e.source === "server-stdout" && /build|compile|typescript/i.test(e.message));

  const pinnedStillPresent = fingerprint
    ? allEvents.some((e) => e.fingerprint === fingerprint)
    : false;

  // Check for HMR events in the buffer
  const hotReloadDetected = buffer.query({ since })
    .some((e) => e.level === "info" && /hmr|hot.?reload|reloaded|compiled/i.test(e.message));

  const input: VerifyLoopInput = {
    claim,
    newErrors,
    pinnedFingerprint: fingerprint,
    pinnedStillPresent,
    buildClean: buildErrors.length === 0,
    hotReloadDetected,
  };

  const result = computeVerdict(input);
  const tip = result.confidence === "high" ? getPositiveNudge("verify_loop") : null;
  return jsonResult({ ...result, claim, since, ...(tip ? { _tip: tip } : {}) });
}
