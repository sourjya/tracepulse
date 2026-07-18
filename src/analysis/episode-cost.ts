/**
 * Per-episode cost metrics (TRP-82) — the first *observational* view of what a
 * resolved investigation episode costs, stratified by modality (arm).
 *
 * Honesty guarantees (from the readiness review):
 *  - Observational, not causal — no control arm (that is TRP-85).
 *  - Headline metrics are directly observed: `time_to_edit_ms` (effort proxy that
 *    excludes the resolution-window timer, F2) and `tool_calls`. Both are stratified
 *    by disjoint arm.
 *  - `tp_response_tokens` is TracePulse's OWN estimated volume (a proxy, not agent
 *    cost) and is reported OVERALL ONLY — never per arm — because shell-arm episodes
 *    receive ~0 token attribution by design, so a by-arm comparison would be a method
 *    artifact (F1).
 *  - Means use a t-critical CI for small, right-skewed samples (F4); `n < 2` yields no
 *    fabricated spread; `n < 5` is flagged `low_confidence`.
 *
 * @see .kiro/specs/telemetry-episode-segmentation/design.md
 * @see TRP-82
 */

import type { Episode } from "@/store/lifecycle-fsm.js";
import { round4 } from "@/analysis/effectiveness-report.js";

/** A measured mean with its sample size and 95% (t) confidence interval. */
export interface MeanWithCI {
  readonly value: number;
  readonly n: number;
  readonly ci_low: number;
  readonly ci_high: number;
  /** Present (true) when n < 5 — the interval is indicative only. */
  readonly low_confidence?: boolean;
}

/** Cleanly-attributed per-episode metrics (stratifiable by arm). */
export interface ArmSplitBlock {
  readonly time_to_edit_ms: MeanWithCI;
  readonly tool_calls: MeanWithCI;
}

/** Per-resolved-episode cost, overall and by disjoint arm. */
export interface PerEpisodeCost {
  /** Overall carries the tp-weighted token proxy in addition to the arm-split metrics. */
  readonly overall: ArmSplitBlock & { readonly tp_response_tokens: MeanWithCI };
  /** Disjoint buckets: a `mixed` episode is counted in `mixed` only, never in tp/shell. */
  readonly by_arm: { readonly tp: ArmSplitBlock; readonly shell: ArmSplitBlock; readonly mixed: ArmSplitBlock };
  readonly provenance: "observational (no control arm)";
  readonly note: string;
}

/**
 * Two-sided 95% Student-t critical values by degrees of freedom (df = n − 1).
 * Index by df; df ≥ 30 uses the normal approximation (1.96). F4.
 */
const T_95_BY_DF: readonly number[] = [
  0,        // df 0 (unused)
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, // df 1–10
  2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,  // df 11–20
  2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045,          // df 21–29
];

function tCritical(df: number): number {
  if (df >= 30) return 1.96;
  if (df < 1) return 0;
  return T_95_BY_DF[df];
}

/**
 * Sample mean with a 95% t confidence interval. Non-negative quantities only —
 * the lower bound is clamped at 0. n = 0 → zeros; n = 1 → no spread. F4.
 */
export function meanWithCI(values: readonly number[]): MeanWithCI {
  const n = values.length;
  if (n === 0) return { value: 0, n: 0, ci_low: 0, ci_high: 0, low_confidence: true };

  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) {
    return { value: round4(mean), n, ci_low: round4(mean), ci_high: round4(mean), low_confidence: true };
  }

  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const half = tCritical(n - 1) * Math.sqrt(variance) / Math.sqrt(n);
  return {
    value: round4(mean),
    n,
    ci_low: round4(Math.max(0, mean - half)),
    ci_high: round4(mean + half),
    ...(n < 5 ? { low_confidence: true } : {}),
  };
}

/** time_to_edit_ms + tool_calls means for a set of episodes. */
function armSplitBlock(episodes: readonly Episode[]): ArmSplitBlock {
  const timesToEdit = episodes
    .filter((e) => e.edit_observed_at !== undefined)
    .map((e) => (e.edit_observed_at as number) - e.started_at);
  const toolCalls = episodes.map((e) => e.tool_calls);
  return { time_to_edit_ms: meanWithCI(timesToEdit), tool_calls: meanWithCI(toolCalls) };
}

const PER_EPISODE_NOTE =
  "Observational per-resolved-episode cost. time_to_edit_ms (surfaced→first edit) is the effort proxy; " +
  "the report's mean_time_to_fix_ms (terminal, incl. the resolution-window timer) is NOT effort. " +
  "tp_response_tokens is TracePulse's own tp-weighted response volume (a proxy, not the agent's cost) and is " +
  "reported overall-only — not split by arm, since shell-arm episodes receive ~0 token attribution by design. " +
  "The arm split reflects MCP-visible tools only (raw shell/Read is invisible; see TRP-83).";

/**
 * Compute per-resolved-episode cost from all completed episodes.
 * Only episodes with `outcome === "resolved"` are counted.
 */
export function computePerEpisodeCost(episodes: readonly Episode[]): PerEpisodeCost {
  const resolved = episodes.filter((e) => e.outcome === "resolved");
  return {
    overall: {
      ...armSplitBlock(resolved),
      tp_response_tokens: meanWithCI(resolved.map((e) => e.tp_response_tokens)),
    },
    by_arm: {
      tp: armSplitBlock(resolved.filter((e) => e.arm === "tp")),
      shell: armSplitBlock(resolved.filter((e) => e.arm === "shell")),
      mixed: armSplitBlock(resolved.filter((e) => e.arm === "mixed")),
    },
    provenance: "observational (no control arm)",
    note: PER_EPISODE_NOTE,
  };
}
