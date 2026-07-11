/**
 * Tests for journal startup compaction.
 *
 * On startup, the journal is read, entries are aggregated into a
 * telemetry summary (telemetry.json), and the journal file is
 * truncated for the new session.
 *
 * @see src/persistence/event-journal.ts compactJournal()
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createEventJournal,
  compactJournal,
  type TelemetrySummary,
} from "@/persistence/event-journal.js";
import type { JournalEntry } from "@/persistence/journal-types.js";

/** Create a temp directory for each test. */
function makeTempDir(): string {
  const dir = join(tmpdir(), `tp-compact-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("compactJournal", () => {
  let tempDir: string;
  let journalPath: string;
  let telemetryPath: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    journalPath = join(tempDir, "events.jsonl");
    telemetryPath = join(tempDir, "telemetry.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns empty summary when journal does not exist", () => {
    const summary = compactJournal(journalPath, telemetryPath);
    expect(summary.sessions).toEqual([]);
    expect(summary.fingerprints).toEqual({});
  });

  it("returns empty summary for empty journal", () => {
    writeFileSync(journalPath, "", "utf-8");
    const summary = compactJournal(journalPath, telemetryPath);
    expect(summary.sessions).toEqual([]);
  });

  it("aggregates a single session into the summary", () => {
    const journal = createEventJournal(journalPath);
    journal.append({ type: "session_start", ts: 1000, sid: "s1", data: { project_type: "node" } });
    journal.append({
      type: "error", ts: 2000, sid: "s1",
      data: { fingerprint: "fp-1", level: "error", message: "Error A", signal_score: 75, source: "server-stderr", service: "main" },
    });
    journal.append({
      type: "error", ts: 3000, sid: "s1",
      data: { fingerprint: "fp-1", level: "error", message: "Error A again", signal_score: 75, source: "server-stderr", service: "main" },
    });
    journal.append({
      type: "error", ts: 4000, sid: "s1",
      data: { fingerprint: "fp-2", level: "warn", message: "Warning B", signal_score: 30, source: "server-stdout", service: "main" },
    });
    journal.append({
      type: "session_end", ts: 5000, sid: "s1",
      data: { duration_ms: 4000, errors_surfaced: 2, errors_suppressed: 1, errors_resolved: 0 },
    });

    const summary = compactJournal(journalPath, telemetryPath);

    // Session summary
    expect(summary.sessions).toHaveLength(1);
    expect(summary.sessions[0].sid).toBe("s1");
    expect(summary.sessions[0].started_at).toBe(1000);
    expect(summary.sessions[0].ended_at).toBe(5000);
    expect(summary.sessions[0].error_count).toBe(3);
    expect(summary.sessions[0].unique_fingerprints).toBe(2);

    // Fingerprint summary
    expect(summary.fingerprints["fp-1"]).toBeDefined();
    expect(summary.fingerprints["fp-1"].total_occurrences).toBe(2);
    expect(summary.fingerprints["fp-1"].first_seen).toBe(2000);
    expect(summary.fingerprints["fp-1"].last_seen).toBe(3000);

    expect(summary.fingerprints["fp-2"]).toBeDefined();
    expect(summary.fingerprints["fp-2"].total_occurrences).toBe(1);
  });

  it("aggregates multiple sessions", () => {
    const journal = createEventJournal(journalPath);

    // Session 1
    journal.append({ type: "session_start", ts: 1000, sid: "s1", data: {} });
    journal.append({
      type: "error", ts: 2000, sid: "s1",
      data: { fingerprint: "fp-1", level: "error", message: "Error", signal_score: 50, source: "server-stderr", service: "main" },
    });
    journal.append({ type: "session_end", ts: 3000, sid: "s1", data: { duration_ms: 2000, errors_surfaced: 1, errors_suppressed: 0, errors_resolved: 0 } });

    // Session 2
    journal.append({ type: "session_start", ts: 10000, sid: "s2", data: {} });
    journal.append({
      type: "error", ts: 11000, sid: "s2",
      data: { fingerprint: "fp-1", level: "error", message: "Error", signal_score: 50, source: "server-stderr", service: "main" },
    });
    journal.append({ type: "session_end", ts: 12000, sid: "s2", data: { duration_ms: 2000, errors_surfaced: 1, errors_suppressed: 0, errors_resolved: 0 } });

    const summary = compactJournal(journalPath, telemetryPath);

    expect(summary.sessions).toHaveLength(2);
    expect(summary.fingerprints["fp-1"].total_occurrences).toBe(2);
    expect(summary.fingerprints["fp-1"].first_seen).toBe(2000);
    expect(summary.fingerprints["fp-1"].last_seen).toBe(11000);
  });

  it("truncates the journal after compaction", () => {
    const journal = createEventJournal(journalPath);
    journal.append({ type: "session_start", ts: 1000, sid: "s1", data: {} });
    journal.append({ type: "session_end", ts: 2000, sid: "s1", data: { duration_ms: 1000, errors_surfaced: 0, errors_suppressed: 0, errors_resolved: 0 } });

    compactJournal(journalPath, telemetryPath);

    // Journal should be empty after compaction
    const content = readFileSync(journalPath, "utf-8");
    expect(content).toBe("");
  });

  it("writes telemetry.json with the summary", () => {
    const journal = createEventJournal(journalPath);
    journal.append({ type: "session_start", ts: 1000, sid: "s1", data: {} });
    journal.append({ type: "session_end", ts: 2000, sid: "s1", data: { duration_ms: 1000, errors_surfaced: 0, errors_suppressed: 0, errors_resolved: 0 } });

    compactJournal(journalPath, telemetryPath);

    expect(existsSync(telemetryPath)).toBe(true);
    const telemetry = JSON.parse(readFileSync(telemetryPath, "utf-8")) as TelemetrySummary;
    expect(telemetry.sessions).toHaveLength(1);
    expect(telemetry.compacted_at).toBeGreaterThan(0);
  });

  it("merges with existing telemetry.json", () => {
    // Write pre-existing telemetry
    const existingTelemetry: TelemetrySummary = {
      version: 1,
      compacted_at: 500,
      sessions: [{
        sid: "s0",
        started_at: 100,
        ended_at: 200,
        error_count: 1,
        unique_fingerprints: 1,
      }],
      fingerprints: {
        "fp-old": { total_occurrences: 3, first_seen: 50, last_seen: 200 },
      },
    };
    writeFileSync(telemetryPath, JSON.stringify(existingTelemetry), "utf-8");

    // Write new journal
    const journal = createEventJournal(journalPath);
    journal.append({ type: "session_start", ts: 1000, sid: "s1", data: {} });
    journal.append({
      type: "error", ts: 1500, sid: "s1",
      data: { fingerprint: "fp-old", level: "error", message: "Same error", signal_score: 50, source: "server-stderr", service: "main" },
    });
    journal.append({ type: "session_end", ts: 2000, sid: "s1", data: { duration_ms: 1000, errors_surfaced: 1, errors_suppressed: 0, errors_resolved: 0 } });

    const summary = compactJournal(journalPath, telemetryPath);

    // Should have both sessions
    expect(summary.sessions).toHaveLength(2);
    // fp-old should have merged counts
    expect(summary.fingerprints["fp-old"].total_occurrences).toBe(4);
    expect(summary.fingerprints["fp-old"].first_seen).toBe(50);
    expect(summary.fingerprints["fp-old"].last_seen).toBe(1500);
  });

  it("handles size cap — keeps only last MAX sessions", () => {
    const journal = createEventJournal(journalPath);

    // Write 60 sessions (over the 50-session cap)
    for (let i = 0; i < 60; i++) {
      journal.append({ type: "session_start", ts: i * 1000, sid: `s${i}`, data: {} });
      journal.append({ type: "session_end", ts: i * 1000 + 500, sid: `s${i}`, data: { duration_ms: 500, errors_surfaced: 0, errors_suppressed: 0, errors_resolved: 0 } });
    }

    const summary = compactJournal(journalPath, telemetryPath);

    // Should cap at MAX_TELEMETRY_SESSIONS (50)
    expect(summary.sessions.length).toBeLessThanOrEqual(50);
    // Should keep the most recent sessions
    expect(summary.sessions[summary.sessions.length - 1].sid).toBe("s59");
  });

  it("tracks lifecycle transitions in the summary", () => {
    const journal = createEventJournal(journalPath);
    journal.append({ type: "session_start", ts: 1000, sid: "s1", data: {} });
    journal.append({
      type: "lifecycle", ts: 2000, sid: "s1",
      data: { fingerprint: "fp-1", from_state: "first_seen", to_state: "surfaced", trigger: "surfaced_to_agent" },
    });
    journal.append({
      type: "lifecycle", ts: 3000, sid: "s1",
      data: { fingerprint: "fp-1", from_state: "surfaced", to_state: "investigated", trigger: "investigated" },
    });
    journal.append({
      type: "lifecycle", ts: 4000, sid: "s1",
      data: { fingerprint: "fp-1", from_state: "edit_observed", to_state: "suppressed", trigger: "resolution_window_elapsed" },
    });
    journal.append({ type: "session_end", ts: 5000, sid: "s1", data: { duration_ms: 4000, errors_surfaced: 1, errors_suppressed: 1, errors_resolved: 0 } });

    const summary = compactJournal(journalPath, telemetryPath);

    // Fingerprint should record last known state
    expect(summary.fingerprints["fp-1"]).toBeDefined();
    expect(summary.fingerprints["fp-1"].last_state).toBe("suppressed");
  });
});
