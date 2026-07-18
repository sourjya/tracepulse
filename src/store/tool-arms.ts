/**
 * Tool → arm (modality) classification — the single source of truth for TRP-82.
 *
 * Two INDEPENDENT axes (see the readiness review, finding F3):
 *
 *  1. Arm classification — how an investigation episode was driven:
 *     `tp` (TracePulse read/investigation tools) vs `shell` (child-process tools).
 *     `classifyArm` is the canonical partition; `mergeArm` combines arms across an
 *     episode's tool calls (tp + shell → mixed).
 *
 *  2. Token-attribution eligibility — whose response tokens we add to an episode.
 *     Only the fingerprint-bearing READ tools qualify (`TOKEN_ATTRIB_TOOLS`). A tool
 *     can be shell-arm yet fingerprint-bearing (e.g. `verify_fix`); it is NOT
 *     token-attributable, because its response is command output, not TracePulse
 *     investigation volume.
 *
 * TracePulse only sees a tool call routed through its MCP server, so `shell` here means
 * `run_and_watch`/`verify_*` — not the agent's own raw Bash (invisible; that denominator
 * is TRP-83).
 *
 * @see .kiro/specs/telemetry-episode-segmentation/design.md
 * @see TRP-82
 */

/** How an episode was driven. `none` until the first arm-bearing tool call. */
export type Arm = "tp" | "shell" | "mixed" | "none";

/**
 * TracePulse read/investigation tools (Axis 1 — tp-arm).
 * These drive investigation without running a child process.
 */
export const TP_ARM_TOOLS: ReadonlySet<string> = new Set([
  "get_errors",
  "get_error_context",
  "get_prompt_context",
  "acknowledge_error",
  "get_error_clusters",
  "get_correlated_errors",
  "get_new_errors",
  "get_timeline",
  "get_error_trends",
  "correlate_with_diff",
  "get_cross_layer_diagnosis",
  "get_build_errors",
  "watch_for_errors",
  "get_server_logs",
  "get_health_summary",
]);

/**
 * Child-process tools (Axis 1 — shell-arm). They run a command via TracePulse's
 * shell executor. `verify_fix` is shell-arm even though it carries a fingerprint (F3).
 */
export const SHELL_ARM_TOOLS: ReadonlySet<string> = new Set([
  "run_and_watch",
  "verify_build",
  "verify_fix",
  "verify_loop",
  "start_server",
  "restart_server",
  "stop_server",
]);

/**
 * Fingerprint-bearing read tools whose response tokens are attributed to the active
 * episode (Axis 2). Deliberately a strict subset of tp-arm: surfacing tools like
 * `get_errors` carry no single fingerprint, and shell tools carry command output.
 */
export const TOKEN_ATTRIB_TOOLS: ReadonlySet<string> = new Set([
  "get_error_context",
  "get_prompt_context",
  "acknowledge_error",
]);

/**
 * Classify a tool's arm. Shell is checked first so a fingerprint-bearing shell tool
 * (`verify_fix`) is never mistaken for tp. Returns null for neutral/unknown tools,
 * which do not set an episode's modality.
 */
export function classifyArm(tool: string): "tp" | "shell" | null {
  if (SHELL_ARM_TOOLS.has(tool)) return "shell";
  if (TP_ARM_TOOLS.has(tool)) return "tp";
  return null;
}

/** Whether a tool's response tokens are attributed to the active episode (Axis 2). */
export function isTokenAttributable(tool: string): boolean {
  return TOKEN_ATTRIB_TOOLS.has(tool);
}

/**
 * Merge an incoming arm into an episode's running arm (monotonic):
 * `none → x`, `x → x`, and any two distinct arms → `mixed`. Never regresses.
 */
export function mergeArm(current: Arm, next: "tp" | "shell"): Arm {
  if (current === "none") return next;
  if (current === next) return current;
  return "mixed";
}
