/**
 * Tests for re-exercise detection in the lifecycle hooks.
 *
 * Re-exercise detection tracks which `run_and_watch` command produced
 * which error fingerprints. When the same command is re-run and those
 * fingerprints do NOT appear, the fix is confirmed as `resolved`.
 *
 * @see src/store/lifecycle-hooks.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createLifecycleHooks,
  type LifecycleHooks,
} from "@/store/lifecycle-hooks.js";
import { createLifecycleFSM, type LifecycleFSM } from "@/store/lifecycle-fsm.js";

describe("lifecycle-hooks re-exercise detection", () => {
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

  describe("positive: confirmed resolution", () => {
    it("resolves fingerprint when same command re-runs without the error", () => {
      // First run: command produces an error
      hooks.onCommandRun("npx vitest run tests/auth.test.ts", ["fp-auth-1"]);
      hooks.onErrorsSurfaced(["fp-auth-1"]);
      hooks.onErrorInvestigated("fp-auth-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // → suppressed

      // Second run: same command, fp-auth-1 NOT in results
      hooks.onCommandRun("npx vitest run tests/auth.test.ts", []);

      expect(fsm.getState("fp-auth-1")).toBe("resolved");
    });

    it("resolves multiple fingerprints from the same command", () => {
      hooks.onCommandRun("npx vitest run", ["fp-1", "fp-2", "fp-3"]);
      hooks.onErrorsSurfaced(["fp-1", "fp-2", "fp-3"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onErrorInvestigated("fp-2");
      hooks.onErrorInvestigated("fp-3");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // all → suppressed

      // Re-run: none of the fingerprints appear
      hooks.onCommandRun("npx vitest run", []);

      expect(fsm.getState("fp-1")).toBe("resolved");
      expect(fsm.getState("fp-2")).toBe("resolved");
      expect(fsm.getState("fp-3")).toBe("resolved");
    });

    it("resolves only the absent fingerprints when some still appear", () => {
      hooks.onCommandRun("pytest tests/", ["fp-fixed", "fp-still-broken"]);
      hooks.onErrorsSurfaced(["fp-fixed", "fp-still-broken"]);
      hooks.onErrorInvestigated("fp-fixed");
      hooks.onErrorInvestigated("fp-still-broken");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // both → suppressed

      // Re-run: fp-still-broken still appears, fp-fixed is gone
      hooks.onCommandRun("pytest tests/", ["fp-still-broken"]);

      expect(fsm.getState("fp-fixed")).toBe("resolved");
      // fp-still-broken recurred — back in the cycle
      expect(fsm.getState("fp-still-broken")).toBe("recurred");
    });

    it("works with edit_observed state (before timer fires)", () => {
      hooks.onCommandRun("npm test", ["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      // Don't advance timer — still in edit_observed

      // Same command, no errors — but fp is still in edit_observed, not suppressed
      // Re-exercise from edit_observed is not valid (must reach suppressed first)
      hooks.onCommandRun("npm test", []);

      // Should still be in edit_observed (re_exercised_absent only valid from suppressed)
      expect(fsm.getState("fp-1")).toBe("edit_observed");
    });
  });

  // ──────────────────────────────────────────────
  // Negative Tests
  // ──────────────────────────────────────────────

  describe("negative: no false resolutions", () => {
    it("does not resolve if a different command runs clean", () => {
      hooks.onCommandRun("npx vitest run tests/auth.test.ts", ["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // → suppressed

      // Different command — not a re-exercise
      hooks.onCommandRun("npx vitest run tests/user.test.ts", []);

      expect(fsm.getState("fp-1")).toBe("suppressed"); // NOT resolved
    });

    it("does not resolve fingerprints that were never surfaced", () => {
      hooks.onCommandRun("pytest", ["fp-unsurfaced"]);
      // Never call onErrorsSurfaced — the error was produced but never shown to agent

      hooks.onCommandRun("pytest", []);
      expect(fsm.getState("fp-unsurfaced")).toBe("first_seen");
    });

    it("does not resolve fingerprints still in surfaced state", () => {
      hooks.onCommandRun("npm test", ["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1"]);
      // Never investigated — still surfaced

      hooks.onCommandRun("npm test", []);
      expect(fsm.getState("fp-1")).toBe("surfaced"); // Can't resolve from surfaced
    });
  });

  // ──────────────────────────────────────────────
  // Edge Cases
  // ──────────────────────────────────────────────

  describe("edge: command matching", () => {
    it("normalizes command prefix for matching (trims whitespace)", () => {
      hooks.onCommandRun("  npx vitest run  ", ["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000);

      hooks.onCommandRun("npx vitest run", []);
      expect(fsm.getState("fp-1")).toBe("resolved");
    });

    it("updates command→fingerprint mapping on repeat runs with new errors", () => {
      // First run: produces fp-1
      hooks.onCommandRun("npm test", ["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000);

      // Second run: produces fp-2 (new error) — fp-1 absent → resolved
      hooks.onCommandRun("npm test", ["fp-2"]);
      expect(fsm.getState("fp-1")).toBe("resolved");

      // Now fp-2 is tracked for this command
      hooks.onErrorsSurfaced(["fp-2"]);
      hooks.onErrorInvestigated("fp-2");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000);

      hooks.onCommandRun("npm test", []);
      expect(fsm.getState("fp-2")).toBe("resolved");
    });

    it("empty fingerprints array on first run is a no-op", () => {
      hooks.onCommandRun("npm test", []);
      // Should not crash or track anything
    });
  });

  // ──────────────────────────────────────────────
  // Regression Tests
  // ──────────────────────────────────────────────

  describe("regression: state interaction", () => {
    it("recurrence from re-exercise correctly transitions", () => {
      hooks.onCommandRun("pytest", ["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // → suppressed

      // Re-exercise produces the same error again — recurrence!
      hooks.onCommandRun("pytest", ["fp-1"]);
      expect(fsm.getState("fp-1")).toBe("recurred");
    });

    it("does not interfere with manual onReExercisedAbsent calls", () => {
      hooks.onCommandRun("pytest", ["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // → suppressed

      // Manual call (from external source)
      hooks.onReExercisedAbsent("fp-1");
      expect(fsm.getState("fp-1")).toBe("resolved");
    });

    it("multiple commands track independently", () => {
      hooks.onCommandRun("pytest tests/auth/", ["fp-auth"]);
      hooks.onCommandRun("pytest tests/user/", ["fp-user"]);

      hooks.onErrorsSurfaced(["fp-auth", "fp-user"]);
      hooks.onErrorInvestigated("fp-auth");
      hooks.onErrorInvestigated("fp-user");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000);

      // Re-run auth tests only — resolves fp-auth but NOT fp-user
      hooks.onCommandRun("pytest tests/auth/", []);
      expect(fsm.getState("fp-auth")).toBe("resolved");
      expect(fsm.getState("fp-user")).toBe("suppressed"); // untouched
    });
  });
});
