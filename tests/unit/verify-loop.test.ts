/**
 * Tests for verify_loop MCP tool — composite fix verification with confidence scoring.
 *
 * verify_loop collapses 5-7 tool calls into one: checks for new errors,
 * verifies pinned fingerprints are gone, checks build status, and detects HMR.
 *
 * @see src/tools/verify-loop.ts
 * @see .kiro/specs/m26-intelligent-feedback/requirements.md Feature 1
 */

import { describe, it, expect } from "vitest";
import { computeVerdict, type VerifyLoopInput, type VerifyLoopResult } from "@/tools/verify-loop.js";

describe("computeVerdict", () => {
  it("returns high confidence when all checks pass and fingerprint gone", () => {
    const input: VerifyLoopInput = {
      claim: "Fixed the TypeError in auth.ts",
      newErrors: [],
      pinnedFingerprint: "abc123",
      pinnedStillPresent: false,
      buildClean: true,
      hotReloadDetected: true,
    };
    const result = computeVerdict(input);
    expect(result.verified).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("returns low confidence when new errors appeared", () => {
    const input: VerifyLoopInput = {
      claim: "Fixed the TypeError",
      newErrors: [{ message: "ReferenceError: x is not defined", signal_score: 60 }],
      pinnedFingerprint: undefined,
      pinnedStillPresent: false,
      buildClean: true,
      hotReloadDetected: true,
    };
    const result = computeVerdict(input);
    expect(result.verified).toBe(false);
    expect(result.confidence).toBe("low");
  });

  it("returns medium confidence when no new errors but can't confirm fingerprint", () => {
    const input: VerifyLoopInput = {
      claim: "Fixed the TypeError",
      newErrors: [],
      pinnedFingerprint: undefined,
      pinnedStillPresent: false,
      buildClean: true,
      hotReloadDetected: false,
    };
    const result = computeVerdict(input);
    expect(result.verified).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("returns low confidence when build is broken", () => {
    const input: VerifyLoopInput = {
      claim: "Fixed the build error",
      newErrors: [],
      pinnedFingerprint: undefined,
      pinnedStillPresent: false,
      buildClean: false,
      hotReloadDetected: true,
    };
    const result = computeVerdict(input);
    expect(result.verified).toBe(false);
    expect(result.confidence).toBe("low");
  });

  it("returns low confidence when pinned fingerprint still present", () => {
    const input: VerifyLoopInput = {
      claim: "Fixed the TypeError in auth.ts",
      newErrors: [],
      pinnedFingerprint: "abc123",
      pinnedStillPresent: true,
      buildClean: true,
      hotReloadDetected: true,
    };
    const result = computeVerdict(input);
    expect(result.verified).toBe(false);
    expect(result.confidence).toBe("low");
  });

  it("includes evidence in result", () => {
    const input: VerifyLoopInput = {
      claim: "Fixed it",
      newErrors: [],
      pinnedFingerprint: "abc123",
      pinnedStillPresent: false,
      buildClean: true,
      hotReloadDetected: true,
    };
    const result = computeVerdict(input);
    expect(result.evidence).toBeDefined();
    expect(result.evidence.new_error_count).toBe(0);
    expect(result.evidence.build_clean).toBe(true);
    expect(result.evidence.hot_reload_detected).toBe(true);
    expect(result.evidence.pinned_resolved).toBe(true);
  });
});
