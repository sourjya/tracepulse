/**
 * Tests for the append-only JSONL event journal writer.
 *
 * Verifies that entries are written as one JSON object per line,
 * that the writer creates directories if needed, and that entries
 * survive process crashes (sync writes).
 *
 * @see src/persistence/event-journal.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createEventJournal,
  type EventJournal,
} from "@/persistence/event-journal.js";
import type { JournalEntry } from "@/persistence/journal-types.js";

/** Create a temp directory for each test. */
function makeTempDir(): string {
  const dir = join(tmpdir(), `tp-journal-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("event-journal", () => {
  let tempDir: string;
  let journalPath: string;
  let journal: EventJournal;

  beforeEach(() => {
    tempDir = makeTempDir();
    journalPath = join(tempDir, "events.jsonl");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("createEventJournal", () => {
    it("creates the journal file on first append", () => {
      journal = createEventJournal(journalPath);
      expect(existsSync(journalPath)).toBe(false);

      const entry: JournalEntry = {
        type: "session_start",
        ts: Date.now(),
        sid: "2026-07-11T13:00:00.000Z",
        data: { project_type: "node" },
      };
      journal.append(entry);

      expect(existsSync(journalPath)).toBe(true);
    });

    it("creates parent directories if they do not exist", () => {
      const deepPath = join(tempDir, "nested", "deep", "events.jsonl");
      journal = createEventJournal(deepPath);

      const entry: JournalEntry = {
        type: "session_start",
        ts: Date.now(),
        sid: "test-sid",
        data: { project_type: "python" },
      };
      journal.append(entry);

      expect(existsSync(deepPath)).toBe(true);
    });
  });

  describe("append", () => {
    beforeEach(() => {
      journal = createEventJournal(journalPath);
    });

    it("writes one JSON object per line", () => {
      const entry1: JournalEntry = {
        type: "error",
        ts: 1000,
        sid: "sid-1",
        data: {
          fingerprint: "fp-1",
          level: "error",
          message: "Something broke",
          signal_score: 50,
          source: "server-stderr",
          service: "main",
        },
      };
      const entry2: JournalEntry = {
        type: "error",
        ts: 2000,
        sid: "sid-1",
        data: {
          fingerprint: "fp-2",
          level: "warn",
          message: "Something else",
          signal_score: 30,
          source: "server-stdout",
          service: "worker",
        },
      };

      journal.append(entry1);
      journal.append(entry2);

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(2);

      const parsed1 = JSON.parse(lines[0]);
      expect(parsed1.type).toBe("error");
      expect(parsed1.ts).toBe(1000);
      expect(parsed1.data.fingerprint).toBe("fp-1");

      const parsed2 = JSON.parse(lines[1]);
      expect(parsed2.type).toBe("error");
      expect(parsed2.ts).toBe(2000);
      expect(parsed2.data.fingerprint).toBe("fp-2");
    });

    it("each line is valid JSON independently", () => {
      for (let i = 0; i < 10; i++) {
        journal.append({
          type: "tool_call",
          ts: Date.now() + i,
          sid: "sid-1",
          data: { tool: `tool_${i}` },
        });
      }

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(10);

      // Every line must parse independently
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it("appends do not overwrite previous entries", () => {
      journal.append({
        type: "session_start",
        ts: 100,
        sid: "sid-1",
        data: { project_type: "node" },
      });

      // Re-create journal instance (simulates process restart reading same file)
      const journal2 = createEventJournal(journalPath);
      journal2.append({
        type: "session_start",
        ts: 200,
        sid: "sid-2",
        data: { project_type: "node" },
      });

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(2);

      expect(JSON.parse(lines[0]).ts).toBe(100);
      expect(JSON.parse(lines[1]).ts).toBe(200);
    });

    it("handles lifecycle entries", () => {
      journal.append({
        type: "lifecycle",
        ts: 5000,
        sid: "sid-1",
        data: {
          fingerprint: "fp-abc",
          from_state: "first_seen",
          to_state: "surfaced",
          trigger: "surfaced_to_agent",
        },
      });

      const content = readFileSync(journalPath, "utf-8");
      const parsed = JSON.parse(content.trim());
      expect(parsed.type).toBe("lifecycle");
      expect(parsed.data.from_state).toBe("first_seen");
      expect(parsed.data.to_state).toBe("surfaced");
    });
  });

  describe("readAll", () => {
    beforeEach(() => {
      journal = createEventJournal(journalPath);
    });

    it("returns empty array for non-existent file", () => {
      const emptyJournal = createEventJournal(join(tempDir, "nope.jsonl"));
      expect(emptyJournal.readAll()).toEqual([]);
    });

    it("returns all entries in order", () => {
      journal.append({ type: "session_start", ts: 1, sid: "s1", data: {} });
      journal.append({ type: "error", ts: 2, sid: "s1", data: { fingerprint: "f1", level: "error", message: "m", signal_score: 50, source: "server-stderr", service: "main" } });
      journal.append({ type: "session_end", ts: 3, sid: "s1", data: { duration_ms: 1000, errors_surfaced: 1, errors_suppressed: 0, errors_resolved: 0 } });

      const entries = journal.readAll();
      expect(entries).toHaveLength(3);
      expect(entries[0].ts).toBe(1);
      expect(entries[1].ts).toBe(2);
      expect(entries[2].ts).toBe(3);
    });

    it("skips corrupt lines gracefully", () => {
      // Write a valid entry, then manually append garbage
      journal.append({ type: "session_start", ts: 1, sid: "s1", data: {} });
      appendFileSync(journalPath, "this is not json\n");
      journal.append({ type: "session_end", ts: 3, sid: "s1", data: { duration_ms: 1000, errors_surfaced: 0, errors_suppressed: 0, errors_resolved: 0 } });

      const entries = journal.readAll();
      // Should have 2 valid entries, corrupt line skipped
      expect(entries).toHaveLength(2);
      expect(entries[0].ts).toBe(1);
      expect(entries[1].ts).toBe(3);
    });
  });

  describe("truncate", () => {
    beforeEach(() => {
      journal = createEventJournal(journalPath);
    });

    it("clears the journal file", () => {
      journal.append({ type: "session_start", ts: 1, sid: "s1", data: {} });
      journal.append({ type: "session_end", ts: 2, sid: "s1", data: { duration_ms: 1000, errors_surfaced: 0, errors_suppressed: 0, errors_resolved: 0 } });

      journal.truncate();

      const content = readFileSync(journalPath, "utf-8");
      expect(content).toBe("");
      expect(journal.readAll()).toEqual([]);
    });
  });

  describe("entryCount", () => {
    beforeEach(() => {
      journal = createEventJournal(journalPath);
    });

    it("tracks the number of appended entries", () => {
      expect(journal.entryCount()).toBe(0);
      journal.append({ type: "session_start", ts: 1, sid: "s1", data: {} });
      expect(journal.entryCount()).toBe(1);
      journal.append({ type: "error", ts: 2, sid: "s1", data: { fingerprint: "f1", level: "error", message: "m", signal_score: 50, source: "server-stderr", service: "main" } });
      expect(journal.entryCount()).toBe(2);
    });
  });
});
