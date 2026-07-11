/**
 * Append-only JSONL event journal for crash-proof telemetry persistence.
 *
 * Writes one JSON object per line to `.tracepulse/events.jsonl`, flushed
 * synchronously on each append. This guarantees that even if the process
 * crashes (SIGKILL, OOM, panic), all events up to the last append are
 * recoverable on disk.
 *
 * Architecture role: This is the D1 component of TRP-10/M27. It replaces
 * the write-on-clean-shutdown pattern in fingerprint-store.ts and
 * session-store.ts, eliminating survivorship bias (crash sessions were
 * previously lost from all metrics).
 *
 * On startup, the compactor (Phase 1.3) reads this journal, aggregates
 * into telemetry.json, and truncates the file for the new session.
 *
 * @see src/persistence/journal-types.ts for entry type definitions
 * @see src/store/lifecycle-fsm.ts for the state machine that produces lifecycle entries
 * @see .kiro/specs/m27-event-journal/design.md for architecture
 */

import {
  existsSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import { type JournalEntry, type LifecycleState, isJournalEntry } from "@/persistence/journal-types.js";

// ──────────────────────────────────────────────
// Public Interface
// ──────────────────────────────────────────────

/**
 * Public API for the event journal.
 *
 * All operations are synchronous to guarantee ordering and crash safety.
 * The journal is append-only during a session — only the startup compactor
 * or explicit truncate() clears it.
 */
export interface EventJournal {
  /**
   * Append a single entry to the journal file.
   * Writes synchronously — blocks until the entry is flushed to disk.
   * Creates the file and parent directories if they don't exist.
   */
  append(entry: JournalEntry): void;

  /**
   * Read all valid entries from the journal file.
   * Skips corrupt lines (invalid JSON or entries that fail the type guard).
   * Returns empty array if the file doesn't exist.
   */
  readAll(): JournalEntry[];

  /**
   * Truncate the journal file (clear all entries).
   * Used after startup compaction to start fresh for the new session.
   */
  truncate(): void;

  /**
   * Get the number of entries appended in the current session.
   * Does not read from disk — uses an in-memory counter.
   */
  entryCount(): number;
}

// ──────────────────────────────────────────────
// Implementation
// ──────────────────────────────────────────────

/**
 * Create an event journal instance bound to a specific file path.
 *
 * The journal does NOT open a file handle on creation — it defers I/O
 * until the first append() call. This makes creation cheap and avoids
 * holding file handles when no events are written.
 *
 * @param filePath - Absolute or relative path to the JSONL file.
 * @returns EventJournal instance.
 */
export function createEventJournal(filePath: string): EventJournal {
  let count = 0;
  let dirEnsured = false;

  /**
   * Ensure the parent directory exists.
   * Cached after first successful check to avoid repeated stat() calls.
   */
  function ensureDir(): void {
    if (dirEnsured) return;
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    dirEnsured = true;
  }

  return {
    append(entry: JournalEntry): void {
      ensureDir();
      const line = JSON.stringify(entry) + "\n";
      appendFileSync(filePath, line, "utf-8");
      count++;
    },

    readAll(): JournalEntry[] {
      if (!existsSync(filePath)) return [];

      try {
        const content = readFileSync(filePath, "utf-8");
        if (!content.trim()) return [];

        const entries: JournalEntry[] = [];
        const lines = content.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed: unknown = JSON.parse(trimmed);
            if (isJournalEntry(parsed)) {
              entries.push(parsed);
            }
            // Invalid entries are silently skipped (corrupt line)
          } catch {
            // JSON parse failed — corrupt line, skip it
          }
        }

        return entries;
      } catch {
        // File read failed — treat as empty
        return [];
      }
    },

    truncate(): void {
      ensureDir();
      writeFileSync(filePath, "", "utf-8");
      count = 0;
    },

    entryCount(): number {
      return count;
    },
  };
}

// ──────────────────────────────────────────────
// Telemetry Summary (compaction output)
// ──────────────────────────────────────────────

/** Maximum sessions to keep in the telemetry summary. */
const MAX_TELEMETRY_SESSIONS = 50;

/** Per-session summary produced by compaction. */
export interface SessionSummary {
  readonly sid: string;
  readonly started_at: number;
  readonly ended_at?: number;
  readonly error_count: number;
  readonly unique_fingerprints: number;
}

/** Per-fingerprint summary produced by compaction. */
export interface FingerprintSummary {
  readonly total_occurrences: number;
  readonly first_seen: number;
  readonly last_seen: number;
  readonly last_state?: LifecycleState;
}

/**
 * Aggregated telemetry summary written to telemetry.json.
 *
 * This is the compacted form of the journal — session-level summaries
 * and fingerprint-level aggregates. Used by the effectiveness report
 * and cross-session pattern analysis.
 */
export interface TelemetrySummary {
  readonly version: 1;
  readonly compacted_at: number;
  readonly sessions: SessionSummary[];
  readonly fingerprints: Record<string, FingerprintSummary>;
}

// ──────────────────────────────────────────────
// Compaction
// ──────────────────────────────────────────────

/**
 * Compact the event journal into a telemetry summary.
 *
 * Reads all entries from the journal, aggregates them into per-session
 * and per-fingerprint summaries, merges with any existing telemetry.json,
 * writes the merged result, and truncates the journal for the new session.
 *
 * Called once on startup before the new session begins writing.
 *
 * @param journalPath - Path to events.jsonl
 * @param telemetryPath - Path to telemetry.json (output)
 * @returns The merged TelemetrySummary
 */
export function compactJournal(journalPath: string, telemetryPath: string): TelemetrySummary {
  // Read existing telemetry (if any)
  let existing: TelemetrySummary = {
    version: 1,
    compacted_at: 0,
    sessions: [],
    fingerprints: {},
  };

  if (existsSync(telemetryPath)) {
    try {
      const raw = readFileSync(telemetryPath, "utf-8");
      const parsed = JSON.parse(raw) as TelemetrySummary;
      if (parsed && parsed.sessions && parsed.fingerprints) {
        existing = parsed;
      }
    } catch {
      // Corrupt telemetry file — start fresh
    }
  }

  // Read journal entries
  const journal = createEventJournal(journalPath);
  const entries = journal.readAll();

  if (entries.length === 0) {
    return existing;
  }

  // Aggregate journal entries into session and fingerprint summaries
  const sessionMap = new Map<string, { started_at: number; ended_at?: number; errors: Set<string>; error_count: number }>();
  const fingerprintMap = new Map<string, { total_occurrences: number; first_seen: number; last_seen: number; last_state?: LifecycleState }>();

  // Seed fingerprint map with existing data
  for (const [fp, data] of Object.entries(existing.fingerprints)) {
    fingerprintMap.set(fp, { ...data });
  }

  for (const entry of entries) {
    // Track sessions
    if (entry.type === "session_start") {
      if (!sessionMap.has(entry.sid)) {
        sessionMap.set(entry.sid, { started_at: entry.ts, errors: new Set(), error_count: 0 });
      }
    } else if (entry.type === "session_end") {
      const session = sessionMap.get(entry.sid);
      if (session) {
        session.ended_at = entry.ts;
      }
    }

    // Track error fingerprints
    if (entry.type === "error") {
      const fp = entry.data.fingerprint;
      const existing_fp = fingerprintMap.get(fp);

      if (existing_fp) {
        existing_fp.total_occurrences++;
        existing_fp.last_seen = Math.max(existing_fp.last_seen, entry.ts);
        existing_fp.first_seen = Math.min(existing_fp.first_seen, entry.ts);
      } else {
        fingerprintMap.set(fp, {
          total_occurrences: 1,
          first_seen: entry.ts,
          last_seen: entry.ts,
        });
      }

      // Add to session error tracking
      const session = sessionMap.get(entry.sid);
      if (session) {
        session.errors.add(fp);
        session.error_count++;
      }
    }

    // Track lifecycle transitions
    if (entry.type === "lifecycle") {
      const fp = entry.data.fingerprint;
      const existing_fp = fingerprintMap.get(fp);

      if (existing_fp) {
        existing_fp.last_state = entry.data.to_state;
      } else {
        fingerprintMap.set(fp, {
          total_occurrences: 0,
          first_seen: entry.ts,
          last_seen: entry.ts,
          last_state: entry.data.to_state,
        });
      }
    }
  }

  // Build session summaries from journal
  const newSessions: SessionSummary[] = [...sessionMap.entries()].map(([sid, data]) => ({
    sid,
    started_at: data.started_at,
    ended_at: data.ended_at,
    error_count: data.error_count,
    unique_fingerprints: data.errors.size,
  }));

  // Merge with existing sessions and cap
  const allSessions = [...existing.sessions, ...newSessions]
    .sort((a, b) => a.started_at - b.started_at)
    .slice(-MAX_TELEMETRY_SESSIONS);

  // Build fingerprint summaries
  const fingerprints: Record<string, FingerprintSummary> = {};
  for (const [fp, data] of fingerprintMap.entries()) {
    fingerprints[fp] = {
      total_occurrences: data.total_occurrences,
      first_seen: data.first_seen,
      last_seen: data.last_seen,
      ...(data.last_state ? { last_state: data.last_state } : {}),
    };
  }

  // Build final summary
  const summary: TelemetrySummary = {
    version: 1,
    compacted_at: Date.now(),
    sessions: allSessions,
    fingerprints,
  };

  // Write telemetry.json
  const dir = dirname(telemetryPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(telemetryPath, JSON.stringify(summary, null, 2), "utf-8");

  // Truncate journal
  journal.truncate();

  return summary;
}
