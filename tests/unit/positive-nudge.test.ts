/**
 * Tests for positive reinforcement nudge.
 *
 * Verifies that nudges fire once per tool per session, then go silent.
 *
 * @see src/analysis/positive-nudge.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getPositiveNudge, resetNudges } from "@/analysis/positive-nudge.js";

describe("getPositiveNudge", () => {
  beforeEach(() => resetNudges());

  it("returns a tip on first call for run_and_watch", () => {
    const tip = getPositiveNudge("run_and_watch");
    expect(tip).not.toBeNull();
    expect(tip).toContain("run_and_watch");
  });

  it("returns null on second call for same tool", () => {
    getPositiveNudge("run_and_watch");
    expect(getPositiveNudge("run_and_watch")).toBeNull();
  });

  it("returns null on third+ calls", () => {
    getPositiveNudge("run_and_watch");
    getPositiveNudge("run_and_watch");
    getPositiveNudge("run_and_watch");
    expect(getPositiveNudge("run_and_watch")).toBeNull();
  });

  it("different tools get independent nudges", () => {
    const tip1 = getPositiveNudge("run_and_watch");
    const tip2 = getPositiveNudge("verify_build");
    expect(tip1).not.toBeNull();
    expect(tip2).not.toBeNull();
    // Second calls are silent
    expect(getPositiveNudge("run_and_watch")).toBeNull();
    expect(getPositiveNudge("verify_build")).toBeNull();
  });

  it("returns null for unknown tools", () => {
    expect(getPositiveNudge("get_errors")).toBeNull();
    expect(getPositiveNudge("shell")).toBeNull();
  });

  it("resetNudges allows tips to fire again", () => {
    getPositiveNudge("run_and_watch");
    expect(getPositiveNudge("run_and_watch")).toBeNull();
    resetNudges();
    expect(getPositiveNudge("run_and_watch")).not.toBeNull();
  });
});
