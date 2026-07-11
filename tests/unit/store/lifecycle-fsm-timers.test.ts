/**
 * Tests for the resolution timer in the lifecycle FSM.
 *
 * When a fingerprint enters `edit_observed`, a timer starts. If the
 * fingerprint doesn't recur within RESOLUTION_WINDOW_MS, the FSM
 * auto-transitions to `suppressed`. If it recurs before the timer
 * fires, the timer is cancelled and state goes to `recurred`.
 *
 * Covers: positive, negative, edge cases, and regression tests.
 *
 * @see src/store/lifecycle-fsm.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createLifecycleFSM,
  type LifecycleFSM,
} from "@/store/lifecycle-fsm.js";
import { RESOLUTION_WINDOW_MS } from "@/constants/limits.js";

describe("lifecycle-fsm resolution timer", () => {
  let fsm: LifecycleFSM;

  beforeEach(() => {
    vi.useFakeTimers();
    fsm = createLifecycleFSM();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper: advance a fingerprint to edit_observed state.
   */
  function advanceToEditObserved(fp: string): void {
    fsm.transition(fp, "surfaced_to_agent");
    fsm.transition(fp, "investigated");
    fsm.transition(fp, "file_changed");
  }

  // ──────────────────────────────────────────────
  // Positive Tests
  // ──────────────────────────────────────────────

  describe("positive: auto-suppression", () => {
    it("auto-transitions to suppressed after RESOLUTION_WINDOW_MS", () => {
      advanceToEditObserved("fp-1");
      expect(fsm.getState("fp-1")).toBe("edit_observed");

      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS);

      expect(fsm.getState("fp-1")).toBe("suppressed");
    });

    it("does NOT transition before RESOLUTION_WINDOW_MS", () => {
      advanceToEditObserved("fp-1");

      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS - 1);

      expect(fsm.getState("fp-1")).toBe("edit_observed");
    });

    it("episode ends with outcome suppressed when timer fires", () => {
      vi.setSystemTime(1000);
      advanceToEditObserved("fp-1");

      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS);

      const episode = fsm.getEpisode("fp-1");
      expect(episode!.outcome).toBe("suppressed");
      expect(episode!.ended_at).toBeDefined();
    });

    it("multiple fingerprints have independent timers", () => {
      advanceToEditObserved("fp-1");
      vi.advanceTimersByTime(10_000);
      advanceToEditObserved("fp-2");

      // fp-1 timer fires at 30s, fp-2 timer fires at 40s
      vi.advanceTimersByTime(20_000);
      expect(fsm.getState("fp-1")).toBe("suppressed");
      expect(fsm.getState("fp-2")).toBe("edit_observed");

      vi.advanceTimersByTime(10_000);
      expect(fsm.getState("fp-2")).toBe("suppressed");
    });
  });

  // ──────────────────────────────────────────────
  // Negative Tests
  // ──────────────────────────────────────────────

  describe("negative: timer cancellation", () => {
    it("cancels timer when fingerprint recurs before window", () => {
      advanceToEditObserved("fp-1");

      // Recurrence before timer fires
      vi.advanceTimersByTime(10_000);
      fsm.transition("fp-1", "recurred");

      expect(fsm.getState("fp-1")).toBe("recurred");

      // Timer should be cancelled — no further transition
      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS);
      expect(fsm.getState("fp-1")).toBe("recurred");
    });

    it("timer does not fire if FSM is in wrong state (manually advanced)", () => {
      advanceToEditObserved("fp-1");

      // Manually trigger resolution_window_elapsed before timer
      fsm.transition("fp-1", "resolution_window_elapsed");
      expect(fsm.getState("fp-1")).toBe("suppressed");

      // Timer fires but state already changed — should be no-op
      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS);
      expect(fsm.getState("fp-1")).toBe("suppressed");
    });

    it("no timer started for states other than edit_observed", () => {
      fsm.transition("fp-1", "surfaced_to_agent");

      // Advance way past the window
      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS * 3);

      // Should still be surfaced — no timer started
      expect(fsm.getState("fp-1")).toBe("surfaced");
    });
  });

  // ──────────────────────────────────────────────
  // Edge Cases
  // ──────────────────────────────────────────────

  describe("edge: boundary conditions", () => {
    it("timer fires exactly at RESOLUTION_WINDOW_MS", () => {
      advanceToEditObserved("fp-1");
      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS);
      expect(fsm.getState("fp-1")).toBe("suppressed");
    });

    it("recurrence at exactly RESOLUTION_WINDOW_MS - 1 cancels timer", () => {
      advanceToEditObserved("fp-1");
      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS - 1);
      fsm.transition("fp-1", "recurred");
      expect(fsm.getState("fp-1")).toBe("recurred");

      // One more ms — timer would have fired but was cancelled
      vi.advanceTimersByTime(1);
      expect(fsm.getState("fp-1")).toBe("recurred");
    });

    it("rapid edit_observed cycle restarts the timer", () => {
      // First cycle
      advanceToEditObserved("fp-1");
      vi.advanceTimersByTime(10_000);

      // Recur and restart
      fsm.transition("fp-1", "recurred");
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");

      // Old timer should not fire at 30s from first edit_observed
      vi.advanceTimersByTime(20_000);
      expect(fsm.getState("fp-1")).toBe("edit_observed");

      // New timer fires at 30s from SECOND edit_observed
      vi.advanceTimersByTime(10_000);
      expect(fsm.getState("fp-1")).toBe("suppressed");
    });
  });

  // ──────────────────────────────────────────────
  // Regression Tests
  // ──────────────────────────────────────────────

  describe("regression: timer cleanup", () => {
    it("timer cleanup does not affect other fingerprints", () => {
      advanceToEditObserved("fp-1");
      advanceToEditObserved("fp-2");

      // Cancel fp-1's timer via recurrence
      fsm.transition("fp-1", "recurred");

      // fp-2's timer should still fire
      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS);
      expect(fsm.getState("fp-1")).toBe("recurred");
      expect(fsm.getState("fp-2")).toBe("suppressed");
    });

    it("no memory leak from timer references after many cycles", () => {
      // Run 50 cycles of edit_observed → recurred (each cancels a timer)
      for (let i = 0; i < 50; i++) {
        advanceToEditObserved("fp-stress");
        fsm.transition("fp-stress", "recurred");
        fsm.transition("fp-stress", "surfaced_to_agent");
        fsm.transition("fp-stress", "investigated");
      }
      fsm.transition("fp-stress", "file_changed");

      // Final timer should still work
      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS);
      expect(fsm.getState("fp-stress")).toBe("suppressed");
    });

    it("getActiveTimerCount returns correct count", () => {
      advanceToEditObserved("fp-1");
      advanceToEditObserved("fp-2");
      advanceToEditObserved("fp-3");

      expect(fsm.getActiveTimerCount()).toBe(3);

      fsm.transition("fp-1", "recurred");
      expect(fsm.getActiveTimerCount()).toBe(2);

      vi.advanceTimersByTime(RESOLUTION_WINDOW_MS);
      expect(fsm.getActiveTimerCount()).toBe(0);
    });
  });
});
