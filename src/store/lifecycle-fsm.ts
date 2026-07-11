/**
 * Per-fingerprint error lifecycle finite state machine.
 *
 * Tracks each error fingerprint through a deterministic lifecycle:
 * first_seen → surfaced → investigated → edit_observed → suppressed → resolved
 *                                                                   → recurred
 *
 * This is the D4 component of TRP-10/M27. It replaces the binary
 * "resolved or not" logic in error-lifecycle.ts with a proper state
 * machine that distinguishes between suppressed (unconfirmed absence)
 * and resolved (confirmed fix via re-exercise).
 *
 * Architecture role: The FSM is the single source of truth for error
 * lifecycle state. MCP tool handlers trigger transitions; the event
 * journal persists them; the effectiveness report queries them.
 *
 * @see src/persistence/journal-types.ts for LifecycleState definition
 * @see src/persistence/event-journal.ts for persistence
 * @see .kiro/specs/m27-event-journal/design.md for architecture
 */

import type { LifecycleState } from "@/persistence/journal-types.js";
import { RESOLUTION_WINDOW_MS } from "@/constants/limits.js";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/**
 * Triggers that cause state transitions.
 * Each trigger corresponds to an observable event in the system.
 */
export type LifecycleTrigger =
  | "surfaced_to_agent"          // Error returned to agent via get_errors
  | "investigated"               // Agent called get_error_context or get_prompt_context
  | "file_changed"               // HMR/build detected after investigation
  | "resolution_window_elapsed"  // Timer fired — error hasn't recurred
  | "re_exercised_absent"        // Same command re-ran, error absent
  | "recurred";                  // Error fingerprint reappeared

/**
 * Public API for the lifecycle finite state machine.
 */
export interface LifecycleFSM {
  /** Get current state for a fingerprint. Returns 'first_seen' if unknown. */
  getState(fingerprint: string): LifecycleState;

  /**
   * Attempt a state transition.
   * Returns true if the transition was valid and applied.
   * Returns false if the transition is invalid from the current state.
   */
  transition(fingerprint: string, trigger: LifecycleTrigger): boolean;

  /** Get all fingerprints currently in a given state. */
  inState(state: LifecycleState): string[];

  /** Export all tracked fingerprint→state mappings. */
  exportStates(): Map<string, LifecycleState>;

  /**
   * Get the current (or most recently completed) episode for a fingerprint.
   * Returns null if no episode has started for this fingerprint.
   */
  getEpisode(fingerprint: string): Episode | null;

  /**
   * Get all completed episodes for a fingerprint (not including active episode).
   * Returns empty array if no completed episodes exist.
   */
  getEpisodeHistory(fingerprint: string): Episode[];

  /**
   * Record a tool call associated with a fingerprint's active episode.
   * Increments the tool_calls counter. No-op if no active episode exists.
   */
  recordToolCall(fingerprint: string): void;

  /**
   * Get the number of active resolution timers.
   * Used for observability and testing.
   */
  getActiveTimerCount(): number;
}

/**
 * An investigation episode — the span from surfaced to a terminal state.
 * Tracks duration, tool call effort, and outcome.
 */
export interface Episode {
  readonly fingerprint: string;
  readonly started_at: number;
  readonly ended_at?: number;
  readonly state: LifecycleState;
  readonly tool_calls: number;
  readonly outcome?: "suppressed" | "resolved" | "recurred";
}

// ──────────────────────────────────────────────
// Transition Table
// ──────────────────────────────────────────────

/**
 * The transition table defines valid (state, trigger) → nextState mappings.
 * Any combination not in this table is an invalid transition.
 *
 * Design rationale: A declarative table makes the FSM deterministic and
 * easy to verify — every valid transition is enumerable, and invalid
 * transitions are rejected by absence from the table.
 */
const TRANSITION_TABLE: ReadonlyMap<LifecycleState, ReadonlyMap<LifecycleTrigger, LifecycleState>> = new Map([
  ["first_seen", new Map<LifecycleTrigger, LifecycleState>([
    ["surfaced_to_agent", "surfaced"],
  ])],
  ["surfaced", new Map<LifecycleTrigger, LifecycleState>([
    ["investigated", "investigated"],
  ])],
  ["investigated", new Map<LifecycleTrigger, LifecycleState>([
    ["file_changed", "edit_observed"],
  ])],
  ["edit_observed", new Map<LifecycleTrigger, LifecycleState>([
    ["resolution_window_elapsed", "suppressed"],
    ["recurred", "recurred"],
  ])],
  ["suppressed", new Map<LifecycleTrigger, LifecycleState>([
    ["re_exercised_absent", "resolved"],
    ["recurred", "recurred"],
  ])],
  ["resolved", new Map<LifecycleTrigger, LifecycleState>([
    ["recurred", "recurred"],
  ])],
  ["recurred", new Map<LifecycleTrigger, LifecycleState>([
    ["surfaced_to_agent", "surfaced"],
  ])],
]);

// ──────────────────────────────────────────────
// Implementation
// ──────────────────────────────────────────────

/** Terminal states that end an episode. */
const TERMINAL_STATES: ReadonlySet<LifecycleState> = new Set(["suppressed", "resolved", "recurred"]);

/** Internal mutable episode record. */
interface MutableEpisode {
  fingerprint: string;
  started_at: number;
  ended_at?: number;
  state: LifecycleState;
  tool_calls: number;
  outcome?: "suppressed" | "resolved" | "recurred";
}

/**
 * Create a lifecycle FSM instance.
 *
 * Each fingerprint is tracked independently. Unknown fingerprints
 * are implicitly in the 'first_seen' state until their first transition.
 * Episode tracking records the span from surfaced to terminal state.
 *
 * @returns LifecycleFSM instance with empty state.
 */
export function createLifecycleFSM(): LifecycleFSM {
  const states = new Map<string, LifecycleState>();
  /** Active (in-progress) episode per fingerprint. */
  const activeEpisodes = new Map<string, MutableEpisode>();
  /** Completed episode history per fingerprint. */
  const episodeHistory = new Map<string, Episode[]>();
  /** Active resolution timers per fingerprint. */
  const resolutionTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Max fingerprints tracked before LRU eviction. */
  const MAX_TRACKED = 1000;
  /** Max completed episodes per fingerprint. */
  const MAX_EPISODES_PER_FP = 10;

  /** Reference to the FSM instance for use in timer callbacks. */
  let fsmInstance: LifecycleFSM;

  /**
   * Start a resolution timer for a fingerprint.
   * When the timer fires, auto-transitions to 'suppressed'.
   * Cancels any existing timer for this fingerprint first.
   */
  function startResolutionTimer(fingerprint: string): void {
    cancelResolutionTimer(fingerprint);
    const timer = setTimeout(() => {
      resolutionTimers.delete(fingerprint);
      // Only fire if still in edit_observed state
      if (states.get(fingerprint) === "edit_observed") {
        fsmInstance.transition(fingerprint, "resolution_window_elapsed");
      }
    }, RESOLUTION_WINDOW_MS);
    resolutionTimers.set(fingerprint, timer);
  }

  /**
   * Cancel the resolution timer for a fingerprint.
   * Called when the fingerprint transitions away from edit_observed.
   */
  function cancelResolutionTimer(fingerprint: string): void {
    const timer = resolutionTimers.get(fingerprint);
    if (timer) {
      clearTimeout(timer);
      resolutionTimers.delete(fingerprint);
    }
  }

  /**
   * Start a new episode for a fingerprint.
   * Called when transitioning to 'surfaced'.
   */
  function startEpisode(fingerprint: string): void {
    activeEpisodes.set(fingerprint, {
      fingerprint,
      started_at: Date.now(),
      state: "surfaced",
      tool_calls: 0,
    });
  }

  /**
   * End the active episode for a fingerprint.
   * Called when reaching a terminal state.
   */
  function endEpisode(fingerprint: string, outcome: "suppressed" | "resolved" | "recurred"): void {
    const episode = activeEpisodes.get(fingerprint);
    if (!episode) return;

    episode.ended_at = Date.now();
    episode.outcome = outcome;

    // Move to history
    const history = episodeHistory.get(fingerprint) ?? [];
    history.push({ ...episode } as Episode);
    // Cap per-fingerprint history
    if (history.length > MAX_EPISODES_PER_FP) {
      history.shift();
    }
    episodeHistory.set(fingerprint, history);

    activeEpisodes.delete(fingerprint);
  }

  fsmInstance = {
    getState(fingerprint: string): LifecycleState {
      return states.get(fingerprint) ?? "first_seen";
    },

    transition(fingerprint: string, trigger: LifecycleTrigger): boolean {
      const currentState = fsmInstance.getState(fingerprint);
      const transitions = TRANSITION_TABLE.get(currentState);

      if (!transitions) return false;

      const nextState = transitions.get(trigger);
      if (nextState === undefined) return false;

      states.set(fingerprint, nextState);

      // Evict oldest tracked fingerprint if over cap (LRU via Map insertion order)
      if (states.size > MAX_TRACKED) {
        const oldestFp = states.keys().next().value;
        if (oldestFp !== undefined && oldestFp !== fingerprint) {
          states.delete(oldestFp);
          activeEpisodes.delete(oldestFp);
          episodeHistory.delete(oldestFp);
          cancelResolutionTimer(oldestFp);
        }
      }

      // Timer management: start when entering edit_observed, cancel when leaving
      if (nextState === "edit_observed") {
        startResolutionTimer(fingerprint);
      } else if ((currentState as string) === "edit_observed") {
        cancelResolutionTimer(fingerprint);
      }

      // Episode lifecycle hooks
      if (nextState === "surfaced") {
        startEpisode(fingerprint);
      } else if (TERMINAL_STATES.has(nextState)) {
        // If there's an active episode, end it
        if (activeEpisodes.has(fingerprint)) {
          endEpisode(fingerprint, nextState as "suppressed" | "resolved" | "recurred");
        } else {
          // No active episode — upgrade the last completed episode's outcome
          // This handles: suppressed → resolved (re-exercise confirmation)
          const history = episodeHistory.get(fingerprint);
          if (history && history.length > 0) {
            const lastEpisode = history[history.length - 1];
            history[history.length - 1] = {
              ...lastEpisode,
              ended_at: Date.now(),
              outcome: nextState as "suppressed" | "resolved" | "recurred",
            };
          }
        }
      } else {
        // Update active episode's state for intermediate transitions
        const episode = activeEpisodes.get(fingerprint);
        if (episode) {
          episode.state = nextState;
        }
      }

      return true;
    },

    inState(state: LifecycleState): string[] {
      const result: string[] = [];
      for (const [fp, s] of states.entries()) {
        if (s === state) result.push(fp);
      }
      return result;
    },

    exportStates(): Map<string, LifecycleState> {
      return new Map(states);
    },

    getEpisode(fingerprint: string): Episode | null {
      // Return active episode if exists
      const active = activeEpisodes.get(fingerprint);
      if (active) return { ...active } as Episode;

      // Otherwise return the most recent completed episode
      const history = episodeHistory.get(fingerprint);
      if (history && history.length > 0) {
        return history[history.length - 1];
      }

      return null;
    },

    getEpisodeHistory(fingerprint: string): Episode[] {
      return episodeHistory.get(fingerprint) ?? [];
    },

    recordToolCall(fingerprint: string): void {
      const episode = activeEpisodes.get(fingerprint);
      if (episode) {
        episode.tool_calls++;
      }
    },

    getActiveTimerCount(): number {
      return resolutionTimers.size;
    },
  };

  return fsmInstance;
}
