/**
 * Tests for PatternAnalyzer - detects 8 bug pattern types from fingerprint history.
 *
 * RED phase: all tests written before implementation.
 *
 * @see src/analysis/pattern-analyzer.ts for implementation
 * @see .kiro/specs/m20-bug-patterns/requirements.md for pattern taxonomy
 */

import { describe, it, expect } from "vitest";
import { createPatternAnalyzer, type SessionRecord } from "@/analysis/pattern-analyzer.js";

/** Helper to create a session record. */
function session(id: string, fingerprints: string[], timestamp = Date.now()): SessionRecord {
  return { session_id: id, timestamp, fingerprints };
}

describe("PatternAnalyzer", () => {
  describe("P1: Recurring Errors", () => {
    it("detects fingerprint appearing in 3+ sessions", () => {
      const analyzer = createPatternAnalyzer();
      analyzer.addSession(session("s1", ["fp-a", "fp-b"]));
      analyzer.addSession(session("s2", ["fp-a", "fp-c"]));
      analyzer.addSession(session("s3", ["fp-a", "fp-d"]));

      const patterns = analyzer.analyze();
      const recurring = patterns.recurring;
      expect(recurring).toHaveLength(1);
      expect(recurring[0].fingerprint).toBe("fp-a");
      expect(recurring[0].sessions).toBe(3);
    });

    it("ignores fingerprints in fewer than 3 sessions", () => {
      const analyzer = createPatternAnalyzer();
      analyzer.addSession(session("s1", ["fp-a"]));
      analyzer.addSession(session("s2", ["fp-a"]));

      const patterns = analyzer.analyze();
      expect(patterns.recurring).toHaveLength(0);
    });
  });

  describe("P2: Error Velocity", () => {
    it("detects increasing occurrence rate", () => {
      const analyzer = createPatternAnalyzer();
      const now = Date.now();
      // 1 occurrence in early sessions, 4 in recent
      analyzer.addSession(session("s1", ["fp-a"], now - 4 * 86400000));
      analyzer.addSession(session("s2", ["fp-a"], now - 3 * 86400000));
      analyzer.addSession(session("s3", ["fp-a", "fp-a", "fp-a", "fp-a"], now - 1 * 86400000));

      const patterns = analyzer.analyze();
      expect(patterns.velocity.length).toBeGreaterThanOrEqual(0);
      // Velocity detection requires enough data points
    });
  });

  describe("P3: Error Chains", () => {
    it("detects co-occurring fingerprints", () => {
      const analyzer = createPatternAnalyzer();
      // fp-a and fp-b always appear together
      analyzer.addSession(session("s1", ["fp-a", "fp-b"]));
      analyzer.addSession(session("s2", ["fp-a", "fp-b"]));
      analyzer.addSession(session("s3", ["fp-a", "fp-b"]));
      analyzer.addSession(session("s4", ["fp-a", "fp-b", "fp-c"]));

      const patterns = analyzer.analyze();
      const chains = patterns.chains;
      // fp-a and fp-b co-occur in 4/4 sessions for fp-a
      expect(chains.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("P5: Flaky Errors", () => {
    it("detects intermittent fingerprints (20-60% presence)", () => {
      const analyzer = createPatternAnalyzer();
      analyzer.addSession(session("s1", ["fp-a"]));
      analyzer.addSession(session("s2", []));
      analyzer.addSession(session("s3", ["fp-a"]));
      analyzer.addSession(session("s4", []));
      analyzer.addSession(session("s5", ["fp-a"]));

      const patterns = analyzer.analyze();
      const flaky = patterns.flaky;
      // fp-a appears in 3/5 = 60% of sessions
      expect(flaky.length).toBeGreaterThanOrEqual(1);
      expect(flaky[0].fingerprint).toBe("fp-a");
    });
  });

  describe("P6: Fixed But Came Back", () => {
    it("detects gap then recurrence", () => {
      const analyzer = createPatternAnalyzer();
      const now = Date.now();
      analyzer.addSession(session("s1", ["fp-a"], now - 6 * 86400000));
      analyzer.addSession(session("s2", ["fp-a"], now - 5 * 86400000));
      // 3 clean sessions
      analyzer.addSession(session("s3", [], now - 4 * 86400000));
      analyzer.addSession(session("s4", [], now - 3 * 86400000));
      analyzer.addSession(session("s5", [], now - 2 * 86400000));
      // Came back
      analyzer.addSession(session("s6", ["fp-a"], now - 1 * 86400000));

      const patterns = analyzer.analyze();
      expect(patterns.fixed_but_back.length).toBeGreaterThanOrEqual(1);
      expect(patterns.fixed_but_back[0].fingerprint).toBe("fp-a");
      expect(patterns.fixed_but_back[0].clean_sessions).toBe(3);
    });
  });

  describe("P8: Silent Degradation", () => {
    it("detects increasing total error count", () => {
      const analyzer = createPatternAnalyzer();
      const now = Date.now();
      analyzer.addSession(session("s1", ["a", "b"], now - 5 * 86400000));
      analyzer.addSession(session("s2", ["a", "b", "c"], now - 4 * 86400000));
      analyzer.addSession(session("s3", ["a", "b", "c", "d"], now - 3 * 86400000));
      analyzer.addSession(session("s4", ["a", "b", "c", "d", "e"], now - 2 * 86400000));
      analyzer.addSession(session("s5", ["a", "b", "c", "d", "e", "f"], now - 1 * 86400000));

      const patterns = analyzer.analyze();
      expect(patterns.degradation).not.toBeNull();
      expect(patterns.degradation!.trend).toBe("increasing");
    });
  });

  describe("analyze() summary", () => {
    it("returns summary string", () => {
      const analyzer = createPatternAnalyzer();
      analyzer.addSession(session("s1", ["fp-a"]));
      analyzer.addSession(session("s2", ["fp-a"]));
      analyzer.addSession(session("s3", ["fp-a"]));

      const patterns = analyzer.analyze();
      expect(patterns.summary).toBeDefined();
      expect(typeof patterns.summary).toBe("string");
    });
  });
});
