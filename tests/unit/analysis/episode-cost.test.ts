/**
 * Tests for per-episode cost metrics (TRP-82).
 *
 * meanWithCI uses a t-critical mean CI (F4); computePerEpisodeCost reports
 * time_to_edit_ms + tool_calls stratified by disjoint arm, and tp_response_tokens
 * overall-only (F1), over resolved episodes only.
 */

import { describe, it, expect } from "vitest";
import { meanWithCI, computePerEpisodeCost } from "@/analysis/episode-cost.js";
import type { Episode } from "@/store/lifecycle-fsm.js";
import type { Arm } from "@/store/tool-arms.js";

describe("meanWithCI", () => {
  it("returns zeros for an empty sample", () => {
    expect(meanWithCI([])).toEqual({ value: 0, n: 0, ci_low: 0, ci_high: 0, low_confidence: true });
  });

  it("returns no spread for n = 1 (and flags low confidence)", () => {
    const r = meanWithCI([42]);
    expect(r.value).toBe(42);
    expect(r.n).toBe(1);
    expect(r.ci_low).toBe(42);
    expect(r.ci_high).toBe(42);
    expect(r.low_confidence).toBe(true);
  });

  it("uses the t-critical value (not 1.96) for small n and clamps the lower bound at 0", () => {
    // values [10, 20]: mean 15, sd sqrt(50)=7.0710678, half = t(0.975,1)=12.706 * sd/sqrt(2)
    const r = meanWithCI([10, 20]);
    expect(r.value).toBe(15);
    expect(r.n).toBe(2);
    expect(r.ci_high).toBeCloseTo(15 + 12.706 * Math.sqrt(50) / Math.sqrt(2), 1); // ≈ 78.53
    expect(r.ci_low).toBe(0); // 15 - 63.5 clamped
    expect(r.low_confidence).toBe(true);
  });

  it("does not flag low confidence at n >= 5 and gives a zero-width CI for identical values", () => {
    const r = meanWithCI([2, 2, 2, 2, 2]);
    expect(r.value).toBe(2);
    expect(r.n).toBe(5);
    expect(r.ci_low).toBe(2);
    expect(r.ci_high).toBe(2);
    expect(r.low_confidence).toBeFalsy();
  });
});

function makeEpisode(over: Partial<Episode> & { outcome?: Episode["outcome"]; arm?: Arm }): Episode {
  return {
    fingerprint: over.fingerprint ?? "fp",
    started_at: over.started_at ?? 0,
    ended_at: over.ended_at,
    state: over.state ?? "resolved",
    tool_calls: over.tool_calls ?? 0,
    outcome: over.outcome,
    arm: over.arm ?? "none",
    tp_response_tokens: over.tp_response_tokens ?? 0,
    edit_observed_at: over.edit_observed_at,
  };
}

describe("computePerEpisodeCost", () => {
  it("counts only resolved episodes and carries provenance + note", () => {
    const episodes: Episode[] = [
      makeEpisode({ outcome: "resolved", arm: "tp", started_at: 0, edit_observed_at: 100, tool_calls: 3, tp_response_tokens: 200 }),
      makeEpisode({ outcome: "suppressed", arm: "tp", started_at: 0, edit_observed_at: 100, tool_calls: 9 }), // excluded
      makeEpisode({ outcome: "recurred", arm: "shell", started_at: 0, edit_observed_at: 50, tool_calls: 9 }), // excluded
    ];
    const cost = computePerEpisodeCost(episodes);
    expect(cost.provenance).toBe("observational (no control arm)");
    expect(cost.note).toMatch(/tp_response_tokens/);
    expect(cost.overall.tool_calls.n).toBe(1);
    expect(cost.overall.tool_calls.value).toBe(3);
    expect(cost.overall.time_to_edit_ms.value).toBe(100);
    expect(cost.overall.tp_response_tokens.value).toBe(200);
  });

  it("stratifies time_to_edit_ms and tool_calls by disjoint arm; mixed is its own bucket", () => {
    const episodes: Episode[] = [
      makeEpisode({ outcome: "resolved", arm: "tp", started_at: 0, edit_observed_at: 100, tool_calls: 2 }),
      makeEpisode({ outcome: "resolved", arm: "tp", started_at: 0, edit_observed_at: 200, tool_calls: 4 }),
      makeEpisode({ outcome: "resolved", arm: "shell", started_at: 0, edit_observed_at: 300, tool_calls: 6 }),
      makeEpisode({ outcome: "resolved", arm: "mixed", started_at: 0, edit_observed_at: 400, tool_calls: 8 }),
    ];
    const cost = computePerEpisodeCost(episodes);
    expect(cost.by_arm.tp.tool_calls.n).toBe(2);
    expect(cost.by_arm.tp.tool_calls.value).toBe(3); // (2+4)/2
    expect(cost.by_arm.shell.tool_calls.n).toBe(1);
    expect(cost.by_arm.shell.tool_calls.value).toBe(6);
    expect(cost.by_arm.mixed.tool_calls.n).toBe(1);
    expect(cost.by_arm.mixed.tool_calls.value).toBe(8);
    // overall spans all four resolved episodes
    expect(cost.overall.tool_calls.n).toBe(4);
  });

  it("does NOT expose tp_response_tokens per arm (F1 — method artifact)", () => {
    const cost = computePerEpisodeCost([
      makeEpisode({ outcome: "resolved", arm: "shell", edit_observed_at: 10, tool_calls: 1 }),
    ]);
    // tokens only on overall, never on the arm buckets
    expect("tp_response_tokens" in cost.overall).toBe(true);
    expect("tp_response_tokens" in cost.by_arm.tp).toBe(false);
    expect("tp_response_tokens" in cost.by_arm.shell).toBe(false);
    expect("tp_response_tokens" in cost.by_arm.mixed).toBe(false);
  });

  it("returns n = 0 blocks (no error, no fabricated value) when there are no resolved episodes", () => {
    const cost = computePerEpisodeCost([
      makeEpisode({ outcome: "suppressed", arm: "tp", edit_observed_at: 10, tool_calls: 5 }),
    ]);
    expect(cost.overall.tool_calls.n).toBe(0);
    expect(cost.overall.tool_calls.value).toBe(0);
    expect(cost.overall.tp_response_tokens.n).toBe(0);
    expect(cost.by_arm.tp.tool_calls.n).toBe(0);
  });
});
