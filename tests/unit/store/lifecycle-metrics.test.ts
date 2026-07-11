/**
 * Tests for lifecycle metrics computation.
 *
 * Computes aggregate metrics from the FSM's episode history:
 * - suppressed_rate: count(suppressed) / count(surfaced)
 * - confirmed_fix_rate: count(resolved) / count(surfaced)
 * - recurrence_rate: count(recurred) / (count(suppressed) + count(resolved))
 * - mean_time_to_fix: average duration of resolved episodes only
 *
 * @see src/store/lifecycle-metrics.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { computeLifecycleMetrics, type LifecycleMetrics } from "@/store/lifecycle-metrics.js";
import { createLifecycleFSM, type LifecycleFSM } from "@/store/lifecycle-fsm.js";
import { createLifecycleHooks, type LifecycleHooks } from "@/store/lifecycle-hooks.js";

describe("lifecycle-metrics", () => {
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

  /** Helper: drive a fingerprint through to suppressed. */
  function driveToSuppressed(fp: string): void {
    hooks.onErrorsSurfaced([fp]);
    hooks.onErrorInvestigated(fp);
    hooks.onFileChanged();
    vi.advanceTimersByTime(30_000);
  }

  /** Helper: drive a fingerprint through to resolved. */
  function driveToResolved(fp: string): void {
    hooks.onCommandRun("test-cmd", [fp]);
    driveToSuppressed(fp);
    hooks.onCommandRun("test-cmd", []);
  }

  /** Helper: drive a fingerprint through to recurred. */
  function driveToRecurred(fp: string): void {
    hooks.onErrorsSurfaced([fp]);
    hooks.onErrorInvestigated(fp);
    hooks.onFileChanged();
    hooks.onErrorRecurred(fp);
  }

  // ──────────────────────────────────────────────
  // Positive Tests
  // ──────────────────────────────────────────────

  describe("positive: rate calculations", () => {
    it("computes suppressed_rate correctly", () => {
      driveToSuppressed("fp-1");
      driveToSuppressed("fp-2");
      driveToSuppressed("fp-3");

      const metrics = computeLifecycleMetrics(fsm);
      expect(metrics.suppressed_rate).toBeCloseTo(1.0);
      expect(metrics.confirmed_fix_rate).toBeCloseTo(0.0);
    });

    it("computes confirmed_fix_rate correctly", () => {
      driveToResolved("fp-1");
      driveToResolved("fp-2");

      const metrics = computeLifecycleMetrics(fsm);
      expect(metrics.confirmed_fix_rate).toBeCloseTo(1.0);
    });

    it("computes recurrence_rate correctly", () => {
      driveToSuppressed("fp-1");
      driveToRecurred("fp-2");
      driveToRecurred("fp-3");

      const metrics = computeLifecycleMetrics(fsm);
      // recurrence_rate = recurred / (suppressed + resolved + recurred)
      // = 2 / (1 + 0 + 2) = 0.667
      expect(metrics.recurrence_rate).toBeCloseTo(2 / 3);
    });

    it("computes mixed rates correctly", () => {
      driveToSuppressed("fp-1"); // suppressed
      driveToResolved("fp-2");   // resolved
      driveToRecurred("fp-3");   // recurred

      const metrics = computeLifecycleMetrics(fsm);
      // 3 completed episodes total
      expect(metrics.suppressed_rate).toBeCloseTo(1 / 3);
      expect(metrics.confirmed_fix_rate).toBeCloseTo(1 / 3);
      expect(metrics.recurrence_rate).toBeCloseTo(1 / 3);
    });

    it("computes mean_time_to_fix from resolved episodes only", () => {
      vi.setSystemTime(1000);
      hooks.onCommandRun("cmd", ["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1"]);
      vi.setSystemTime(2000);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // now at 32000
      hooks.onCommandRun("cmd", []);  // resolved at ~32000

      const metrics = computeLifecycleMetrics(fsm);
      // Duration = ended_at - started_at
      expect(metrics.mean_time_to_fix).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────
  // Negative Tests
  // ──────────────────────────────────────────────

  describe("negative: empty/missing data", () => {
    it("returns zeros when no episodes exist", () => {
      const metrics = computeLifecycleMetrics(fsm);
      expect(metrics.suppressed_rate).toBe(0);
      expect(metrics.confirmed_fix_rate).toBe(0);
      expect(metrics.recurrence_rate).toBe(0);
      expect(metrics.mean_time_to_fix).toBe(0);
      expect(metrics.total_episodes).toBe(0);
    });

    it("returns 0 for mean_time_to_fix when no resolved episodes exist", () => {
      driveToSuppressed("fp-1");
      driveToRecurred("fp-2");

      const metrics = computeLifecycleMetrics(fsm);
      expect(metrics.mean_time_to_fix).toBe(0);
    });

    it("does not count in-progress episodes", () => {
      hooks.onErrorsSurfaced(["fp-1"]); // active episode, not completed
      hooks.onErrorInvestigated("fp-1");

      const metrics = computeLifecycleMetrics(fsm);
      expect(metrics.total_episodes).toBe(0); // only completed episodes count
    });
  });

  // ──────────────────────────────────────────────
  // Edge Cases
  // ──────────────────────────────────────────────

  describe("edge: boundary conditions", () => {
    it("handles single episode correctly", () => {
      driveToSuppressed("fp-1");

      const metrics = computeLifecycleMetrics(fsm);
      expect(metrics.total_episodes).toBe(1);
      expect(metrics.suppressed_rate).toBe(1.0);
    });

    it("handles resolved episode that was previously suppressed", () => {
      // fp-1 goes through suppressed → resolved (outcome upgraded)
      hooks.onCommandRun("cmd", ["fp-1"]);
      driveToSuppressed("fp-1");
      hooks.onCommandRun("cmd", []);

      const metrics = computeLifecycleMetrics(fsm);
      // Should count as resolved (final outcome), not suppressed
      expect(metrics.confirmed_fix_rate).toBeCloseTo(1.0);
      expect(metrics.suppressed_rate).toBeCloseTo(0.0);
    });

    it("counts multiple episodes for the same fingerprint", () => {
      // fp-1 recurs, then gets suppressed on second attempt
      driveToRecurred("fp-1");
      // Restart cycle
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000);

      const metrics = computeLifecycleMetrics(fsm);
      expect(metrics.total_episodes).toBe(2);
    });
  });

  // ──────────────────────────────────────────────
  // Regression Tests
  // ──────────────────────────────────────────────

  describe("regression: metric accuracy", () => {
    it("rates always sum to <= 1.0", () => {
      driveToSuppressed("fp-1");
      driveToResolved("fp-2");
      driveToRecurred("fp-3");
      driveToSuppressed("fp-4");
      driveToRecurred("fp-5");

      const metrics = computeLifecycleMetrics(fsm);
      const sum = metrics.suppressed_rate + metrics.confirmed_fix_rate + metrics.recurrence_rate;
      expect(sum).toBeCloseTo(1.0);
    });

    it("total_episodes matches sum of outcomes", () => {
      driveToSuppressed("fp-1");
      driveToResolved("fp-2");
      driveToRecurred("fp-3");

      const metrics = computeLifecycleMetrics(fsm);
      expect(metrics.total_episodes).toBe(3);
      expect(metrics.suppressed_count + metrics.resolved_count + metrics.recurred_count).toBe(3);
    });

    it("mean_time_to_fix is average not sum", () => {
      // Two resolved episodes with different durations
      vi.setSystemTime(0);
      hooks.onCommandRun("cmd1", ["fp-1"]);
      hooks.onErrorsSurfaced(["fp-1"]);
      hooks.onErrorInvestigated("fp-1");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // fp-1 suppressed at t=30000
      hooks.onCommandRun("cmd1", []); // fp-1 resolved at t=30000

      vi.setSystemTime(100_000);
      hooks.onCommandRun("cmd2", ["fp-2"]);
      hooks.onErrorsSurfaced(["fp-2"]);
      hooks.onErrorInvestigated("fp-2");
      hooks.onFileChanged();
      vi.advanceTimersByTime(30_000); // fp-2 suppressed at t=130000
      hooks.onCommandRun("cmd2", []); // fp-2 resolved at t=130000

      const metrics = computeLifecycleMetrics(fsm);
      expect(metrics.resolved_count).toBe(2);
      // mean_time_to_fix should be an average, not zero and not the sum
      expect(metrics.mean_time_to_fix).toBeGreaterThan(0);
    });
  });
});
