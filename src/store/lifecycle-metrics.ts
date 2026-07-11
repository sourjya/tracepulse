/**
 * Lifecycle metrics computation from FSM episode history.
 *
 * Aggregates completed episodes across all fingerprints to produce
 * effectiveness metrics: suppressed_rate, confirmed_fix_rate,
 * recurrence_rate, and mean_time_to_fix.
 *
 * These metrics are the D16 output — the honest distinction between
 * "error disappeared" (suppressed) and "error confirmed fixed" (resolved).
 *
 * Architecture role: Called by the effectiveness report tool handler.
 * Reads from the FSM's episode history (read-only, no mutations).
 *
 * @see src/store/lifecycle-fsm.ts for the FSM and Episode type
 * @see .kiro/specs/m27-event-journal/design.md for metric definitions
 */

import type { LifecycleFSM, Episode } from "@/store/lifecycle-fsm.js";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/**
 * Aggregate lifecycle metrics computed from completed episodes.
 * All rates are 0-1 fractions (not percentages).
 */
export interface LifecycleMetrics {
  /** Total completed episodes (suppressed + resolved + recurred). */
  readonly total_episodes: number;
  /** Count of episodes that ended as suppressed. */
  readonly suppressed_count: number;
  /** Count of episodes that ended as resolved. */
  readonly resolved_count: number;
  /** Count of episodes that ended as recurred. */
  readonly recurred_count: number;
  /** Fraction of episodes that ended as suppressed (0-1). */
  readonly suppressed_rate: number;
  /** Fraction of episodes that ended as resolved (0-1). */
  readonly confirmed_fix_rate: number;
  /** Fraction of episodes that ended as recurred (0-1). */
  readonly recurrence_rate: number;
  /** Average duration (ms) of resolved episodes only. 0 if none. */
  readonly mean_time_to_fix: number;
}

// ──────────────────────────────────────────────
// Implementation
// ──────────────────────────────────────────────

/**
 * Compute lifecycle metrics from the FSM's episode history.
 *
 * Iterates all completed episodes across all tracked fingerprints.
 * Only completed episodes (with an outcome) are counted.
 * Active/in-progress episodes are excluded.
 *
 * @param fsm - The lifecycle FSM to read episode history from.
 * @returns Computed LifecycleMetrics.
 */
export function computeLifecycleMetrics(fsm: LifecycleFSM): LifecycleMetrics {
  // Collect all completed episodes from all fingerprints
  const allEpisodes: Episode[] = [];
  const states = fsm.exportStates();

  for (const [fp] of states) {
    const history = fsm.getEpisodeHistory(fp);
    allEpisodes.push(...history);
  }

  // Also check for episodes of fingerprints in terminal states
  // that have their last episode in history (covers edge cases)
  // The exportStates gives us all tracked fingerprints

  if (allEpisodes.length === 0) {
    return {
      total_episodes: 0,
      suppressed_count: 0,
      resolved_count: 0,
      recurred_count: 0,
      suppressed_rate: 0,
      confirmed_fix_rate: 0,
      recurrence_rate: 0,
      mean_time_to_fix: 0,
    };
  }

  // Count outcomes
  let suppressed = 0;
  let resolved = 0;
  let recurred = 0;
  let resolvedDurationSum = 0;

  for (const episode of allEpisodes) {
    switch (episode.outcome) {
      case "suppressed":
        suppressed++;
        break;
      case "resolved":
        resolved++;
        if (episode.ended_at !== undefined) {
          resolvedDurationSum += episode.ended_at - episode.started_at;
        }
        break;
      case "recurred":
        recurred++;
        break;
    }
  }

  const total = suppressed + resolved + recurred;

  return {
    total_episodes: total,
    suppressed_count: suppressed,
    resolved_count: resolved,
    recurred_count: recurred,
    suppressed_rate: total > 0 ? suppressed / total : 0,
    confirmed_fix_rate: total > 0 ? resolved / total : 0,
    recurrence_rate: total > 0 ? recurred / total : 0,
    mean_time_to_fix: resolved > 0 ? resolvedDurationSum / resolved : 0,
  };
}
