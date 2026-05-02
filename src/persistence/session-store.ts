/**
 * Session history persistence for bug pattern detection.
 *
 * Stores per-session fingerprint lists in .tracepulse/sessions.json.
 * Each session records which fingerprints appeared, enabling cross-session
 * pattern analysis (recurring, flaky, fixed-but-back, etc.).
 *
 * @see src/analysis/pattern-analyzer.ts for pattern detection
 * @see .kiro/specs/m20-bug-patterns/requirements.md
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { SessionRecord } from "@/analysis/pattern-analyzer.js";
import { FINGERPRINT_PERSISTENCE_PATH } from "@/constants/services.js";

/** Max sessions to keep in history. */
const MAX_SESSIONS = 50;

/** On-disk file schema. */
interface SessionFile {
  readonly version: 1;
  readonly sessions: SessionRecord[];
}

/**
 * Derive session store path from fingerprint path.
 * .tracepulse/fingerprints.json -> .tracepulse/sessions.json
 */
function getSessionPath(): string {
  const dir = dirname(FINGERPRINT_PERSISTENCE_PATH);
  return resolve(dir, "sessions.json");
}

/**
 * Load session history from disk.
 *
 * @returns Array of session records, or empty if file missing/corrupt.
 */
export function loadSessionHistory(): SessionRecord[] {
  const path = getSessionPath();
  if (!existsSync(path)) return [];

  try {
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw) as SessionFile;
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

/**
 * Save a new session to the history file.
 * Appends the session and caps at MAX_SESSIONS (oldest evicted).
 *
 * @param record - Session record to append.
 */
export function saveSession(record: SessionRecord): void {
  const path = getSessionPath();
  const existing = loadSessionHistory();
  existing.push(record);

  // Keep only the most recent sessions
  const capped = existing
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_SESSIONS);

  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const data: SessionFile = { version: 1, sessions: capped };
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[tracepulse] Warning: failed to save session history: ${msg}\n`);
  }
}
