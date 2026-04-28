/**
 * Fingerprint persistence store for cross-session error tracking.
 *
 * Loads and saves fingerprint data to a JSON file in .tracepulse/.
 * Entries contain only metadata (no raw messages) for security.
 * LRU eviction caps entries at MAX_PERSISTED_FINGERPRINTS.
 *
 * @see src/constants/services.ts for MAX_PERSISTED_FINGERPRINTS
 * @see .kiro/specs/phase3-multi-process/design.md for persistence design
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MAX_PERSISTED_FINGERPRINTS } from "@/constants/services.js";

/** A single persisted fingerprint entry - no raw messages for security. */
export interface PersistedFingerprintEntry {
  readonly fingerprint: string;
  readonly first_seen: number;
  readonly last_seen: number;
  readonly total_count: number;
  /** Last error message (truncated to 200 chars). Optional for backward compat. */
  readonly last_message?: string;
}

/** On-disk file schema. */
interface FingerprintFile {
  readonly version: 1;
  readonly written_at: number;
  readonly entries: PersistedFingerprintEntry[];
}

/**
 * Load fingerprints from a JSON file.
 *
 * @param filePath - Path to the fingerprints JSON file.
 * @returns Array of persisted entries, or empty array if file missing/corrupt.
 */
export function loadFingerprints(filePath: string): PersistedFingerprintEntry[] {
  if (!existsSync(filePath)) return [];

  try {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as FingerprintFile;
    return data.entries ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[tracepulse] Warning: corrupted fingerprint file, starting fresh: ${msg}\n`,
    );
    return [];
  }
}

/**
 * Save fingerprints to a JSON file.
 *
 * Creates the directory if it doesn't exist. Caps entries at
 * MAX_PERSISTED_FINGERPRINTS, evicting oldest by last_seen.
 * Failures are logged but do not throw.
 *
 * @param filePath - Path to write the fingerprints JSON file.
 * @param entries - Fingerprint entries to persist.
 */
export function saveFingerprints(
  filePath: string,
  entries: readonly PersistedFingerprintEntry[],
): void {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // LRU eviction: sort by last_seen descending, keep top N
    const sorted = [...entries].sort((a, b) => b.last_seen - a.last_seen);
    const capped = sorted.slice(0, MAX_PERSISTED_FINGERPRINTS);

    const data: FingerprintFile = {
      version: 1,
      written_at: Date.now(),
      entries: capped,
    };

    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[tracepulse] Warning: failed to save fingerprints: ${msg}\n`,
    );
  }
}
