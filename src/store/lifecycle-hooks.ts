/**
 * Lifecycle hooks — integration layer between MCP tool handlers and the FSM.
 *
 * Provides a clean API that tool handlers call to trigger FSM transitions
 * without needing to know the FSM internals. Each hook corresponds to an
 * observable event in the system:
 *
 * - onErrorsSurfaced: called when get_errors returns fingerprints to the agent
 * - onErrorInvestigated: called when get_error_context/get_prompt_context/acknowledge
 * - onFileChanged: called when HMR/hot-reload is detected
 * - onErrorRecurred: called when a previously-suppressed fingerprint reappears
 * - onReExercisedAbsent: called when same command re-ran with no recurrence
 *
 * Architecture role: This decouples the MCP server from the FSM implementation.
 * The server calls hooks; the hooks call FSM transitions. This makes both
 * sides independently testable.
 *
 * @see src/store/lifecycle-fsm.ts for the FSM
 * @see src/mcp/server.ts for the tool handlers that call these hooks
 * @see .kiro/specs/m27-event-journal/design.md for the data flow diagram
 */

import type { LifecycleFSM } from "@/store/lifecycle-fsm.js";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/**
 * Public API for lifecycle hooks.
 * Tool handlers call these methods to trigger FSM transitions.
 */
export interface LifecycleHooks {
  /**
   * Called when get_errors returns fingerprints to the agent.
   * Transitions each fingerprint: first_seen → surfaced (or recurred → surfaced).
   * Idempotent for already-surfaced fingerprints (transition fails silently).
   */
  onErrorsSurfaced(fingerprints: readonly string[]): void;

  /**
   * Called when get_error_context, get_prompt_context, or acknowledge_error
   * is invoked for a specific fingerprint.
   * Transitions: surfaced → investigated.
   * Also records a tool call on the active episode.
   */
  onErrorInvestigated(fingerprint: string): void;

  /**
   * Called when a file change (HMR/hot-reload) is detected.
   * Transitions all fingerprints currently in 'investigated' state → edit_observed.
   * This starts the resolution timer for each affected fingerprint.
   */
  onFileChanged(): void;

  /**
   * Called when a previously-suppressed or resolved fingerprint reappears.
   * Transitions: edit_observed/suppressed/resolved → recurred.
   */
  onErrorRecurred(fingerprint: string): void;

  /**
   * Called when re-exercise evidence is available: same command ran again
   * and the fingerprint did NOT recur.
   * Transitions: suppressed → resolved (confirmed fix).
   */
  onReExercisedAbsent(fingerprint: string): void;
}

// ──────────────────────────────────────────────
// Implementation
// ──────────────────────────────────────────────

/**
 * Create lifecycle hooks bound to an FSM instance.
 *
 * @param fsm - The lifecycle FSM to trigger transitions on.
 * @returns LifecycleHooks instance.
 */
export function createLifecycleHooks(fsm: LifecycleFSM): LifecycleHooks {
  return {
    onErrorsSurfaced(fingerprints: readonly string[]): void {
      for (const fp of fingerprints) {
        // Attempt transition — silently fails if already surfaced/investigated
        fsm.transition(fp, "surfaced_to_agent");
      }
    },

    onErrorInvestigated(fingerprint: string): void {
      // Attempt transition surfaced → investigated
      fsm.transition(fingerprint, "investigated");
      // Always record the tool call regardless of transition success
      fsm.recordToolCall(fingerprint);
    },

    onFileChanged(): void {
      // Transition all fingerprints currently in 'investigated' to 'edit_observed'
      const investigated = fsm.inState("investigated");
      for (const fp of investigated) {
        fsm.transition(fp, "file_changed");
      }
    },

    onErrorRecurred(fingerprint: string): void {
      // Attempt recurrence transition — valid from edit_observed, suppressed, or resolved
      fsm.transition(fingerprint, "recurred");
    },

    onReExercisedAbsent(fingerprint: string): void {
      // Attempt re-exercise transition — valid from suppressed only
      fsm.transition(fingerprint, "re_exercised_absent");
    },
  };
}
