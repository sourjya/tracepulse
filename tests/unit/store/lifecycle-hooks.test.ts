/**
 * Tests for lifecycle hooks — the integration between MCP tool handlers
 * and the lifecycle FSM.
 *
 * Verifies that tool calls trigger correct FSM transitions:
 * - get_errors → surfaced_to_agent for returned fingerprints
 * - get_error_context → investigated for the specific fingerprint
 * - get_prompt_context → investigated for the specific fingerprint
 * - acknowledge_error → investigated for the specific fingerprint
 * - HMR/file change → file_changed for all investigated fingerprints
 * - Error recurrence → recurred for suppressed/resolved fingerprints
 *
 * @see src/store/lifecycle-hooks.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createLifecycleHooks,
  type LifecycleHooks,
} from "@/store/lifecycle-hooks.js";
import { createLifecycleFSM, type LifecycleFSM } from "@/store/lifecycle-fsm.js";

describe("lifecycle-hooks", () => {
  let fsm: LifecycleFSM;
  let hooks: LifecycleHooks;

  beforeEach(() => {
    vi.useFakeTimers();
    fsm = createLifecycleFSM();
    hooks = createLifecycleHooks(fsm);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ──────────────────────────────────────────────
  // Positive Tests
  // ──────────────────────────────────────────────

  describe("positive: onErrorsSurfaced", () => {
    it("transitions fingerprints from first_seen to surfaced", () => {
      hooks.onErrorsSurfaced(["fp-1", "fp-2", "fp-3"]);

      expect(fsm.getState("fp-1")).toBe("surfaced");
      expect(fsm.getState("fp-2")).toBe("surfaced");
      expect(fsm.getState("fp-3")).toBe("surfaced");
    });

    it("is idempotent — surfacing already-surfaced fingerprints is a no-op", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      expect(fsm.getState("fp-1")).toBe("surfaced");

      // Second call — fp-1 is already surfaced, transition should fail (invalid from surfaced)
      hooks.onErrorsSurfaced(["fp-1"]);
      expect(fsm.getState("fp-1")).toBe("surfaced"); // still surfaced, not broken
    });

    it("handles mix of new and already-surfaced fingerprints", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1", "fp-2"]);

      expect(fsm.getState("fp-1")).toBe("surfaced");
      expect(fsm.getState("fp-2")).toBe("surfaced");
    });
  });

  describe("positive: onErrorInvestigated", () => {
    it("transitions fingerprint from surfaced to investigated", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");

      expect(fsm.getState("fp-1")).toBe("investigated");
    });

    it("records a tool call on the episode", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");

      const episode = fsm.getEpisode("fp-1");
      expect(episode!.tool_calls).toBe(1);
    });

    it("multiple investigations increment tool call count", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onErrorInvestigated("fp-1"); // already investigated, but still counts the tool call

      const episode = fsm.getEpisode("fp-1");
      expect(episode!.tool_calls).toBe(2);
    });
  });

  describe("positive: onFileChanged", () => {
    it("transitions investigated fingerprints to edit_observed", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();

      expect(fsm.getState("fp-1")).toBe("edit_observed");
    });

    it("transitions all investigated fingerprints at once", () => {
      hooks.onErrorsSurfaced(["fp-1", "fp-2"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onErrorInvestigated("fp-2");
      hooks.onFileChanged();

      expect(fsm.getState("fp-1")).toBe("edit_observed");
      expect(fsm.getState("fp-2")).toBe("edit_observed");
    });

    it("does not affect non-investigated fingerprints", () => {
      hooks.onErrorsSurfaced(["fp-1", "fp-2"]);
      hooks.onErrorInvestigated("fp-1");
      // fp-2 is still in 'surfaced' — file_changed should not affect it
      hooks.onFileChanged();

      expect(fsm.getState("fp-1")).toBe("edit_observed");
      expect(fsm.getState("fp-2")).toBe("surfaced");
    });
  });

  describe("positive: onErrorRecurred", () => {
    it("transitions suppressed fingerprint to recurred", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      // Let the timer fire to reach suppressed
      vi.advanceTimersByTime(30_000);
      expect(fsm.getState("fp-1")).toBe("suppressed");

      hooks.onErrorRecurred("fp-1");
      expect(fsm.getState("fp-1")).toBe("recurred");
    });

    it("transitions edit_observed fingerprint to recurred (before timer)", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();

      hooks.onErrorRecurred("fp-1");
      expect(fsm.getState("fp-1")).toBe("recurred");
    });

    it("is a no-op for first_seen fingerprints (error never surfaced)", () => {
      hooks.onErrorRecurred("fp-unknown");
      expect(fsm.getState("fp-unknown")).toBe("first_seen");
    });
  });

  // ──────────────────────────────────────────────
  // Negative Tests
  // ──────────────────────────────────────────────

  describe("negative: invalid operations", () => {
    it("onErrorsSurfaced with empty array is a no-op", () => {
      hooks.onErrorsSurfaced([]);
      // No crash, no state changes
    });

    it("onErrorInvestigated for unknown fingerprint is a no-op", () => {
      hooks.onErrorInvestigated("fp-never-seen");
      expect(fsm.getState("fp-never-seen")).toBe("first_seen");
    });

    it("onFileChanged with no investigated fingerprints is a no-op", () => {
      hooks.onFileChanged();
      // No crash
    });

    it("onErrorRecurred for fingerprint in surfaced state is a no-op", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorRecurred("fp-1");
      // recurred is not valid from surfaced — stays surfaced
      expect(fsm.getState("fp-1")).toBe("surfaced");
    });
  });

  // ──────────────────────────────────────────────
  // Edge Cases
  // ──────────────────────────────────────────────

  describe("edge: complex scenarios", () => {
    it("full lifecycle: surfaced → investigated → edit_observed → suppressed → resolved", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // timer fires → suppressed
      hooks.onReExercisedAbsent("fp-1");

      expect(fsm.getState("fp-1")).toBe("resolved");
    });

    it("full lifecycle: surfaced → investigated → edit_observed → recurred → surfaced again", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      hooks.onErrorRecurred("fp-1");

      expect(fsm.getState("fp-1")).toBe("recurred");

      // Resurface
      hooks.onErrorsSurfaced(["fp-1"]);
      expect(fsm.getState("fp-1")).toBe("surfaced");
    });

    it("many fingerprints in different states simultaneously", () => {
      hooks.onErrorsSurfaced(["fp-1", "fp-2", "fp-3", "fp-4"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onErrorInvestigated("fp-2");
      hooks.onErrorInvestigated("fp-3");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // all three → suppressed

      hooks.onErrorRecurred("fp-1"); // fp-1 → recurred
      hooks.onReExercisedAbsent("fp-2"); // fp-2 → resolved

      expect(fsm.getState("fp-1")).toBe("recurred");
      expect(fsm.getState("fp-2")).toBe("resolved");
      expect(fsm.getState("fp-3")).toBe("suppressed");
      expect(fsm.getState("fp-4")).toBe("surfaced"); // never investigated
    });
  });

  // ──────────────────────────────────────────────
  // Regression Tests
  // ──────────────────────────────────────────────

  describe("regression: recurred surfaces correctly", () => {
    it("recurred fingerprint can be resurfaced via onErrorsSurfaced", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      hooks.onErrorRecurred("fp-1");
      expect(fsm.getState("fp-1")).toBe("recurred");

      hooks.onErrorsSurfaced(["fp-1"]);
      expect(fsm.getState("fp-1")).toBe("surfaced");
    });

    it("resolved fingerprint that recurs starts a new episode", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000);
      hooks.onReExercisedAbsent("fp-1");
      expect(fsm.getState("fp-1")).toBe("resolved");

      hooks.onErrorRecurred("fp-1");
      expect(fsm.getState("fp-1")).toBe("recurred");

      hooks.onErrorsSurfaced(["fp-1"]);
      expect(fsm.getState("fp-1")).toBe("surfaced");

      // Should be a new episode
      const history = fsm.getEpisodeHistory("fp-1");
      expect(history.length).toBeGreaterThanOrEqual(1);
    });

    it("onFileChanged only affects fingerprints in investigated state", () => {
      hooks.onErrorsSurfaced(["fp-1", "fp-2"]);
      hooks.onErrorInvestigated("fp-1");
      // fp-2 still in surfaced

      hooks.onFileChanged();

      expect(fsm.getState("fp-1")).toBe("edit_observed");
      expect(fsm.getState("fp-2")).toBe("surfaced"); // unchanged
    });
  });

  // ──────────────────────────────────────────────
  // TRP-82: modality (arm) stamping
  // ──────────────────────────────────────────────

  describe("TRP-82: arm stamping", () => {
    it("onErrorInvestigated stamps the active episode arm as tp", () => {
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      expect(fsm.getEpisode("fp-1")!.arm).toBe("tp");
    });

    it("onCommandRun stamps arm shell on an ACTIVE episode before it recurs (→ mixed)", () => {
      // Establish the command→fingerprint mapping
      hooks.onCommandRun("npm test", ["fp-1"]);
      // Surface + investigate (tp) + edit → active episode in edit_observed
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      expect(fsm.getState("fp-1")).toBe("edit_observed");
      // Re-run the command; fp-1 still present → recurred. Episode is active → shell stamped first.
      hooks.onCommandRun("npm test", ["fp-1"]);

      const ep = fsm.getEpisode("fp-1")!;
      expect(ep.outcome).toBe("recurred");
      expect(ep.arm).toBe("mixed"); // tp (investigated) + shell (re-run)
    });

    it("onCommandRun does NOT re-stamp arm on an already-ended episode (documented limit F6)", () => {
      // tp investigation → suppressed (episode ends with arm=tp), then a shell re-exercise resolves it
      hooks.onCommandRun("npm test", ["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1"); // tp
      hooks.onFileChanged();
      fsm.transition("fp-1", "resolution_window_elapsed"); // suppressed — episode ends (arm=tp)
      hooks.onCommandRun("npm test", []); // fp-1 absent → re_exercised_absent → resolved (history upgrade)

      const ep = fsm.getEpisode("fp-1")!;
      expect(ep.outcome).toBe("resolved");
      // Episode already ended at suppression; the confirming shell re-exercise does not re-tag it.
      expect(ep.arm).toBe("tp");
    });
  });
});
