/**
 * Tests for journal entry type definitions and type guards.
 *
 * Verifies that the discriminated union JournalEntry is correctly
 * typed and that runtime type guards correctly classify entries.
 *
 * @see src/persistence/journal-types.ts
 */

import { describe, it, expect } from "vitest";
import {
  type JournalEntry,
  type LifecycleState,
  isJournalEntry,
  isLifecycleState,
  LIFECYCLE_STATES,
  JOURNAL_ENTRY_TYPES,
} from "@/persistence/journal-types.js";

describe("journal-types", () => {
  describe("LIFECYCLE_STATES", () => {
    it("contains all 7 lifecycle states", () => {
      expect(LIFECYCLE_STATES).toHaveLength(7);
      expect(LIFECYCLE_STATES).toContain("first_seen");
      expect(LIFECYCLE_STATES).toContain("surfaced");
      expect(LIFECYCLE_STATES).toContain("investigated");
      expect(LIFECYCLE_STATES).toContain("edit_observed");
      expect(LIFECYCLE_STATES).toContain("suppressed");
      expect(LIFECYCLE_STATES).toContain("resolved");
      expect(LIFECYCLE_STATES).toContain("recurred");
    });
  });

  describe("JOURNAL_ENTRY_TYPES", () => {
    it("contains all 5 entry types", () => {
      expect(JOURNAL_ENTRY_TYPES).toHaveLength(5);
      expect(JOURNAL_ENTRY_TYPES).toContain("error");
      expect(JOURNAL_ENTRY_TYPES).toContain("lifecycle");
      expect(JOURNAL_ENTRY_TYPES).toContain("tool_call");
      expect(JOURNAL_ENTRY_TYPES).toContain("session_start");
      expect(JOURNAL_ENTRY_TYPES).toContain("session_end");
    });
  });

  describe("isLifecycleState", () => {
    it("returns true for valid states", () => {
      expect(isLifecycleState("first_seen")).toBe(true);
      expect(isLifecycleState("surfaced")).toBe(true);
      expect(isLifecycleState("investigated")).toBe(true);
      expect(isLifecycleState("edit_observed")).toBe(true);
      expect(isLifecycleState("suppressed")).toBe(true);
      expect(isLifecycleState("resolved")).toBe(true);
      expect(isLifecycleState("recurred")).toBe(true);
    });

    it("returns false for invalid values", () => {
      expect(isLifecycleState("unknown")).toBe(false);
      expect(isLifecycleState("")).toBe(false);
      expect(isLifecycleState(null)).toBe(false);
      expect(isLifecycleState(undefined)).toBe(false);
      expect(isLifecycleState(42)).toBe(false);
    });
  });

  describe("isJournalEntry", () => {
    it("validates a correct error entry", () => {
      const entry: JournalEntry = {
        type: "error",
        ts: Date.now(),
        sid: "2026-07-11T13:00:00.000Z",
        data: {
          fingerprint: "abc123",
          level: "error",
          message: "TypeError: Cannot read property 'x'",
          signal_score: 75,
          source: "server-stderr",
          service: "main",
        },
      };
      expect(isJournalEntry(entry)).toBe(true);
    });

    it("validates a correct lifecycle entry", () => {
      const entry: JournalEntry = {
        type: "lifecycle",
        ts: Date.now(),
        sid: "2026-07-11T13:00:00.000Z",
        data: {
          fingerprint: "abc123",
          from_state: "first_seen",
          to_state: "surfaced",
          trigger: "surfaced_to_agent",
        },
      };
      expect(isJournalEntry(entry)).toBe(true);
    });

    it("validates a correct tool_call entry", () => {
      const entry: JournalEntry = {
        type: "tool_call",
        ts: Date.now(),
        sid: "2026-07-11T13:00:00.000Z",
        data: {
          tool: "get_errors",
          fingerprint: "abc123",
          investigating: true,
        },
      };
      expect(isJournalEntry(entry)).toBe(true);
    });

    it("validates a correct session_start entry", () => {
      const entry: JournalEntry = {
        type: "session_start",
        ts: Date.now(),
        sid: "2026-07-11T13:00:00.000Z",
        data: {
          agent: { name: "kiro", version: "1.0.0" },
          project_type: "node",
        },
      };
      expect(isJournalEntry(entry)).toBe(true);
    });

    it("validates a correct session_end entry", () => {
      const entry: JournalEntry = {
        type: "session_end",
        ts: Date.now(),
        sid: "2026-07-11T13:00:00.000Z",
        data: {
          duration_ms: 300000,
          errors_surfaced: 5,
          errors_suppressed: 3,
          errors_resolved: 1,
        },
      };
      expect(isJournalEntry(entry)).toBe(true);
    });

    it("rejects entries with missing type", () => {
      expect(isJournalEntry({ ts: 123, sid: "x", data: {} })).toBe(false);
    });

    it("rejects entries with invalid type", () => {
      expect(isJournalEntry({ type: "invalid", ts: 123, sid: "x", data: {} })).toBe(false);
    });

    it("rejects entries with missing ts", () => {
      expect(isJournalEntry({ type: "error", sid: "x", data: {} })).toBe(false);
    });

    it("rejects entries with non-numeric ts", () => {
      expect(isJournalEntry({ type: "error", ts: "not-a-number", sid: "x", data: {} })).toBe(false);
    });

    it("rejects entries with missing sid", () => {
      expect(isJournalEntry({ type: "error", ts: 123, data: {} })).toBe(false);
    });

    it("rejects entries with missing data", () => {
      expect(isJournalEntry({ type: "error", ts: 123, sid: "x" })).toBe(false);
    });

    it("rejects null and undefined", () => {
      expect(isJournalEntry(null)).toBe(false);
      expect(isJournalEntry(undefined)).toBe(false);
    });

    it("rejects non-objects", () => {
      expect(isJournalEntry("string")).toBe(false);
      expect(isJournalEntry(42)).toBe(false);
      expect(isJournalEntry([])).toBe(false);
    });
  });
});
