/**
 * Tests for the error lifecycle finite state machine.
 *
 * Verifies that:
 * - All valid state transitions succeed
 * - Invalid transitions are rejected
 * - The FSM is deterministic (same events → same state)
 * - Default state for unknown fingerprints is 'first_seen'
 *
 * @see src/store/lifecycle-fsm.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createLifecycleFSM,
  type LifecycleFSM,
  type LifecycleTrigger,
} from "@/store/lifecycle-fsm.js";
import type { LifecycleState } from "@/persistence/journal-types.js";

describe("lifecycle-fsm", () => {
  let fsm: LifecycleFSM;

  beforeEach(() => {
    fsm = createLifecycleFSM();
  });

  describe("getState", () => {
    it("returns 'first_seen' for unknown fingerprints", () => {
      expect(fsm.getState("unknown-fp")).toBe("first_seen");
    });

    it("returns the current state after transitions", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      expect(fsm.getState("fp-1")).toBe("surfaced");
    });
  });

  describe("valid transitions", () => {
    it("first_seen → surfaced via surfaced_to_agent", () => {
      const result = fsm.transition("fp-1", "surfaced_to_agent");
      expect(result).toBe(true);
      expect(fsm.getState("fp-1")).toBe("surfaced");
    });

    it("surfaced → investigated via investigated", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      const result = fsm.transition("fp-1", "investigated");
      expect(result).toBe(true);
      expect(fsm.getState("fp-1")).toBe("investigated");
    });

    it("investigated → edit_observed via file_changed", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      const result = fsm.transition("fp-1", "file_changed");
      expect(result).toBe(true);
      expect(fsm.getState("fp-1")).toBe("edit_observed");
    });

    it("edit_observed → suppressed via resolution_window_elapsed", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      const result = fsm.transition("fp-1", "resolution_window_elapsed");
      expect(result).toBe(true);
      expect(fsm.getState("fp-1")).toBe("suppressed");
    });

    it("suppressed → resolved via re_exercised_absent", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      fsm.transition("fp-1", "resolution_window_elapsed");
      const result = fsm.transition("fp-1", "re_exercised_absent");
      expect(result).toBe(true);
      expect(fsm.getState("fp-1")).toBe("resolved");
    });

    it("suppressed → recurred via recurred", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      fsm.transition("fp-1", "resolution_window_elapsed");
      const result = fsm.transition("fp-1", "recurred");
      expect(result).toBe(true);
      expect(fsm.getState("fp-1")).toBe("recurred");
    });

    it("resolved → recurred via recurred", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      fsm.transition("fp-1", "resolution_window_elapsed");
      fsm.transition("fp-1", "re_exercised_absent");
      const result = fsm.transition("fp-1", "recurred");
      expect(result).toBe(true);
      expect(fsm.getState("fp-1")).toBe("recurred");
    });

    it("recurred → surfaced via surfaced_to_agent (restart cycle)", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      fsm.transition("fp-1", "resolution_window_elapsed");
      fsm.transition("fp-1", "recurred");
      const result = fsm.transition("fp-1", "surfaced_to_agent");
      expect(result).toBe(true);
      expect(fsm.getState("fp-1")).toBe("surfaced");
    });
  });

  describe("invalid transitions", () => {
    it("rejects investigated without surfaced first", () => {
      const result = fsm.transition("fp-1", "investigated");
      expect(result).toBe(false);
      expect(fsm.getState("fp-1")).toBe("first_seen");
    });

    it("rejects file_changed from first_seen", () => {
      const result = fsm.transition("fp-1", "file_changed");
      expect(result).toBe(false);
      expect(fsm.getState("fp-1")).toBe("first_seen");
    });

    it("rejects resolution_window_elapsed from surfaced", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      const result = fsm.transition("fp-1", "resolution_window_elapsed");
      expect(result).toBe(false);
      expect(fsm.getState("fp-1")).toBe("surfaced");
    });

    it("rejects re_exercised_absent from investigated", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      const result = fsm.transition("fp-1", "re_exercised_absent");
      expect(result).toBe(false);
      expect(fsm.getState("fp-1")).toBe("investigated");
    });
  });

  describe("determinism", () => {
    it("same event sequence always produces same final state", () => {
      const triggers: LifecycleTrigger[] = [
        "surfaced_to_agent",
        "investigated",
        "file_changed",
        "resolution_window_elapsed",
        "re_exercised_absent",
      ];

      // Run the same sequence on two independent FSM instances
      const fsm2 = createLifecycleFSM();

      for (const trigger of triggers) {
        fsm.transition("fp-1", trigger);
        fsm2.transition("fp-1", trigger);
      }

      expect(fsm.getState("fp-1")).toBe(fsm2.getState("fp-1"));
      expect(fsm.getState("fp-1")).toBe("resolved");
    });
  });

  describe("inState", () => {
    it("returns fingerprints in a specific state", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-2", "surfaced_to_agent");
      fsm.transition("fp-2", "investigated");

      expect(fsm.inState("surfaced")).toContain("fp-1");
      expect(fsm.inState("surfaced")).not.toContain("fp-2");
      expect(fsm.inState("investigated")).toContain("fp-2");
    });

    it("returns empty array for states with no fingerprints", () => {
      expect(fsm.inState("resolved")).toEqual([]);
    });
  });

  describe("exportStates", () => {
    it("exports all tracked fingerprint states", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-2", "surfaced_to_agent");
      fsm.transition("fp-2", "investigated");

      const states = fsm.exportStates();
      expect(states.get("fp-1")).toBe("surfaced");
      expect(states.get("fp-2")).toBe("investigated");
    });
  });

  describe("multiple fingerprints", () => {
    it("tracks state independently per fingerprint", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");

      fsm.transition("fp-2", "surfaced_to_agent");

      expect(fsm.getState("fp-1")).toBe("investigated");
      expect(fsm.getState("fp-2")).toBe("surfaced");
      expect(fsm.getState("fp-3")).toBe("first_seen");
    });
  });
});
