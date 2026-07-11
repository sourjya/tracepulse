/**
 * Tests for episode tracking in the lifecycle FSM.
 *
 * An "investigation episode" is the span from when an error is surfaced
 * to the agent until it reaches a terminal state (suppressed/resolved/recurred).
 * Episodes track duration, tool call count, and outcome.
 *
 * Covers: positive, negative, edge cases, and regression tests.
 *
 * @see src/store/lifecycle-fsm.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createLifecycleFSM,
  type LifecycleFSM,
  type Episode,
} from "@/store/lifecycle-fsm.js";

describe("lifecycle-fsm episode tracking", () => {
  let fsm: LifecycleFSM;

  beforeEach(() => {
    vi.useFakeTimers();
    fsm = createLifecycleFSM();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ──────────────────────────────────────────────
  // Positive Tests
  // ──────────────────────────────────────────────

  describe("positive: episode lifecycle", () => {
    it("episode starts when fingerprint transitions to surfaced", () => {
      vi.setSystemTime(1000);
      fsm.transition("fp-1", "surfaced_to_agent");

      const episode = fsm.getEpisode("fp-1");
      expect(episode).not.toBeNull();
      expect(episode!.fingerprint).toBe("fp-1");
      expect(episode!.started_at).toBe(1000);
      expect(episode!.ended_at).toBeUndefined();
      expect(episode!.outcome).toBeUndefined();
    });

    it("episode ends when fingerprint reaches suppressed", () => {
      vi.setSystemTime(1000);
      fsm.transition("fp-1", "surfaced_to_agent");
      vi.setSystemTime(2000);
      fsm.transition("fp-1", "investigated");
      vi.setSystemTime(3000);
      fsm.transition("fp-1", "file_changed");
      vi.setSystemTime(5000);
      fsm.transition("fp-1", "resolution_window_elapsed");

      const episode = fsm.getEpisode("fp-1");
      expect(episode).not.toBeNull();
      expect(episode!.ended_at).toBe(5000);
      expect(episode!.outcome).toBe("suppressed");
    });

    it("episode ends when fingerprint reaches resolved", () => {
      vi.setSystemTime(1000);
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      fsm.transition("fp-1", "resolution_window_elapsed");
      vi.setSystemTime(8000);
      fsm.transition("fp-1", "re_exercised_absent");

      const episode = fsm.getEpisode("fp-1");
      expect(episode!.ended_at).toBe(8000);
      expect(episode!.outcome).toBe("resolved");
    });

    it("episode ends when fingerprint reaches recurred", () => {
      vi.setSystemTime(1000);
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      vi.setSystemTime(4000);
      fsm.transition("fp-1", "recurred");

      const episode = fsm.getEpisode("fp-1");
      expect(episode!.ended_at).toBe(4000);
      expect(episode!.outcome).toBe("recurred");
    });

    it("records tool_calls count during episode", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.recordToolCall("fp-1");
      fsm.recordToolCall("fp-1");
      fsm.recordToolCall("fp-1");

      const episode = fsm.getEpisode("fp-1");
      expect(episode!.tool_calls).toBe(3);
    });

    it("new episode starts on recurred → surfaced cycle", () => {
      vi.setSystemTime(1000);
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      vi.setSystemTime(3000);
      fsm.transition("fp-1", "recurred");

      // First episode should be complete
      const ep1 = fsm.getEpisode("fp-1");
      expect(ep1!.outcome).toBe("recurred");

      // Start a new cycle
      vi.setSystemTime(5000);
      fsm.transition("fp-1", "surfaced_to_agent");

      const ep2 = fsm.getEpisode("fp-1");
      expect(ep2!.started_at).toBe(5000);
      expect(ep2!.ended_at).toBeUndefined();
      expect(ep2!.outcome).toBeUndefined();
      expect(ep2!.tool_calls).toBe(0);
    });
  });

  // ──────────────────────────────────────────────
  // Negative Tests
  // ──────────────────────────────────────────────

  describe("negative: invalid operations", () => {
    it("returns null for fingerprint with no episode", () => {
      expect(fsm.getEpisode("nonexistent")).toBeNull();
    });

    it("recordToolCall is a no-op for fingerprint with no active episode", () => {
      // Should not throw
      fsm.recordToolCall("nonexistent");
      expect(fsm.getEpisode("nonexistent")).toBeNull();
    });

    it("recordToolCall does not increment after episode ends", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.recordToolCall("fp-1");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      fsm.transition("fp-1", "resolution_window_elapsed");

      // Episode ended — tool calls after should not count
      fsm.recordToolCall("fp-1");
      const episode = fsm.getEpisode("fp-1");
      expect(episode!.tool_calls).toBe(1);
    });
  });

  // ──────────────────────────────────────────────
  // Edge Cases
  // ──────────────────────────────────────────────

  describe("edge: boundary conditions", () => {
    it("episode duration is 0 when start and end are the same timestamp", () => {
      vi.setSystemTime(1000);
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      fsm.transition("fp-1", "resolution_window_elapsed");

      const episode = fsm.getEpisode("fp-1");
      expect(episode!.ended_at! - episode!.started_at).toBe(0);
    });

    it("multiple fingerprints track independent episodes", () => {
      vi.setSystemTime(1000);
      fsm.transition("fp-1", "surfaced_to_agent");
      vi.setSystemTime(2000);
      fsm.transition("fp-2", "surfaced_to_agent");

      fsm.recordToolCall("fp-1");
      fsm.recordToolCall("fp-1");
      fsm.recordToolCall("fp-2");

      const ep1 = fsm.getEpisode("fp-1");
      const ep2 = fsm.getEpisode("fp-2");
      expect(ep1!.started_at).toBe(1000);
      expect(ep1!.tool_calls).toBe(2);
      expect(ep2!.started_at).toBe(2000);
      expect(ep2!.tool_calls).toBe(1);
    });

    it("episode preserves state across all intermediate transitions", () => {
      vi.setSystemTime(100);
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.recordToolCall("fp-1");
      vi.setSystemTime(200);
      fsm.transition("fp-1", "investigated");
      fsm.recordToolCall("fp-1");
      vi.setSystemTime(300);
      fsm.transition("fp-1", "file_changed");

      const episode = fsm.getEpisode("fp-1");
      expect(episode!.started_at).toBe(100);
      expect(episode!.tool_calls).toBe(2);
      expect(episode!.state).toBe("edit_observed");
      expect(episode!.ended_at).toBeUndefined();
    });

    it("failed transitions do not affect episode", () => {
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.recordToolCall("fp-1");

      // Invalid transition — should not end episode
      fsm.transition("fp-1", "resolution_window_elapsed");

      const episode = fsm.getEpisode("fp-1");
      expect(episode!.ended_at).toBeUndefined();
      expect(episode!.tool_calls).toBe(1);
    });
  });

  // ──────────────────────────────────────────────
  // Regression Tests
  // ──────────────────────────────────────────────

  describe("regression: episode history", () => {
    it("getEpisodeHistory returns all completed episodes for a fingerprint", () => {
      // First episode: surfaced → recurred
      vi.setSystemTime(1000);
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      vi.setSystemTime(2000);
      fsm.transition("fp-1", "recurred");

      // Second episode: surfaced → suppressed
      vi.setSystemTime(3000);
      fsm.transition("fp-1", "surfaced_to_agent");
      fsm.transition("fp-1", "investigated");
      fsm.transition("fp-1", "file_changed");
      vi.setSystemTime(4000);
      fsm.transition("fp-1", "resolution_window_elapsed");

      const history = fsm.getEpisodeHistory("fp-1");
      expect(history).toHaveLength(2);
      expect(history[0].outcome).toBe("recurred");
      expect(history[0].started_at).toBe(1000);
      expect(history[1].outcome).toBe("suppressed");
      expect(history[1].started_at).toBe(3000);
    });

    it("getEpisodeHistory returns empty array for unknown fingerprint", () => {
      expect(fsm.getEpisodeHistory("unknown")).toEqual([]);
    });

    it("current active episode is included in getEpisode but not getEpisodeHistory", () => {
      vi.setSystemTime(1000);
      fsm.transition("fp-1", "surfaced_to_agent");

      // Active episode visible via getEpisode
      expect(fsm.getEpisode("fp-1")).not.toBeNull();
      // But not in history (only completed episodes)
      expect(fsm.getEpisodeHistory("fp-1")).toHaveLength(0);
    });
  });
});
