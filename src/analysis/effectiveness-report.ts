/**
 * Effectiveness report — cumulative, statistically-honest view of TracePulse's
 * observed lifecycle outcomes.
 *
 * Unlike get_session_impact (a modeled estimate), every rate here is MEASURED from
 * real FSM episode outcomes and reported as {value, n, ci} with a 95% Wilson score
 * interval, so a rate computed from 2 episodes isn't read the same as one from 200.
 *
 * @see src/store/lifecycle-metrics.ts for the underlying counts
 * @see docs/research/telemetry-savings-measurement.md (TRP-73)
 * @see TRP-84
 */

import type { LifecycleMetrics } from "@/store/lifecycle-metrics.js";
import type { PerEpisodeCost } from "@/analysis/episode-cost.js";

/** A measured rate with its sample size and 95% confidence interval. */
export interface RateWithCI {
  /** Point estimate (0-1). */
  readonly value: number;
  /** Sample size the rate is computed from. */
  readonly n: number;
  /** Lower bound of the 95% Wilson score interval. */
  readonly ci_low: number;
  /** Upper bound of the 95% Wilson score interval. */
  readonly ci_high: number;
}

/** Cumulative effectiveness report. All rates are measured, not modeled. */
export interface EffectivenessReport {
  readonly provenance: string;
  readonly tp_version: string;
  readonly total_episodes: number;
  readonly confirmed_fix_rate: RateWithCI;
  readonly recurrence_rate: RateWithCI;
  readonly suppressed_rate: RateWithCI;
  /** Mean duration (ms) of resolved episodes; n is the resolved count. */
  readonly mean_time_to_fix_ms: number;
  readonly counts: {
    readonly suppressed: number;
    readonly resolved: number;
    readonly recurred: number;
  };
  /** TracePulse's own response-token volume this session (context, not agent cost). */
  readonly tp_response_tokens_total: number;
  /** Observational per-resolved-episode cost, stratified by arm (TRP-82). */
  readonly per_episode_cost: PerEpisodeCost;
  readonly note: string;
}

/** Round to 4 decimal places. */
export function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/**
 * 95% Wilson score interval for a binomial proportion.
 *
 * More honest than the normal approximation at small n and near 0/1 — it never
 * produces bounds outside [0, 1]. Returns {low:0, high:0} for n = 0.
 *
 * @param successes - Number of successes.
 * @param n - Sample size.
 * @param z - Z-score (default 1.96 = 95%).
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    low: round4(Math.max(0, (center - margin) / denom)),
    high: round4(Math.min(1, (center + margin) / denom)),
  };
}

/** Build a RateWithCI from a success count over a sample size. */
function rateWithCI(successes: number, n: number): RateWithCI {
  const { low, high } = wilsonInterval(successes, n);
  return { value: n > 0 ? round4(successes / n) : 0, n, ci_low: low, ci_high: high };
}

/**
 * Compute the effectiveness report from lifecycle metrics.
 *
 * @param metrics - Aggregate lifecycle metrics (from computeLifecycleMetrics).
 * @param opts - Version stamp + TracePulse's own response-token total.
 */
export function computeEffectivenessReport(
  metrics: LifecycleMetrics,
  opts: { version: string; tpResponseTokensTotal: number; perEpisodeCost: PerEpisodeCost },
): EffectivenessReport {
  const n = metrics.total_episodes;
  return {
    provenance: "measured (this session's lifecycle outcomes)",
    tp_version: opts.version,
    total_episodes: n,
    confirmed_fix_rate: rateWithCI(metrics.resolved_count, n),
    recurrence_rate: rateWithCI(metrics.recurred_count, n),
    suppressed_rate: rateWithCI(metrics.suppressed_count, n),
    mean_time_to_fix_ms: metrics.mean_time_to_fix,
    counts: {
      suppressed: metrics.suppressed_count,
      resolved: metrics.resolved_count,
      recurred: metrics.recurred_count,
    },
    tp_response_tokens_total: opts.tpResponseTokensTotal,
    per_episode_cost: opts.perEpisodeCost,
    note:
      "Rates are this session's observed FSM episode outcomes with 95% Wilson score intervals (measured, not modeled). " +
      "per_episode_cost adds observational per-resolved-episode cost by arm (TRP-82); cross-agent stratification and a " +
      "real agent-token denominator remain pending (TRP-83). " +
      "tp_response_tokens_total is TracePulse's own response volume, not the agent's investigation cost.",
  };
}
