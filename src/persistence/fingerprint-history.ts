/**
 * Fingerprint history manager for cross-session error tracking.
 *
 * Tracks which error fingerprints have been seen, their first/last occurrence,
 * and total count. Used by get_new_errors and get_error_trends.
 *
 * @see src/persistence/fingerprint-store.ts for file I/O
 */

import type { PersistedFingerprintEntry } from "@/persistence/fingerprint-store.js";

/** In-memory record for a fingerprint. */
export interface FingerprintRecord {
  readonly fingerprint: string;
  readonly first_seen: number;
  readonly last_seen: number;
  readonly total_occurrences: number;
  readonly last_message?: string;
}

/** Public API for the fingerprint history manager. */
export interface FingerprintHistory {
  /** Check if a fingerprint has never been seen. */
  isNew(fingerprint: string): boolean;
  /** Record an occurrence of a fingerprint. */
  record(fingerprint: string, timestamp: number, message?: string): void;
  /** Get the full record for a fingerprint, or null. */
  getRecord(fingerprint: string): FingerprintRecord | null;
  /** Load persisted entries into memory. */
  loadEntries(entries: readonly PersistedFingerprintEntry[]): void;
  /** Export all records for persistence. */
  exportEntries(): PersistedFingerprintEntry[];
}

/**
 * Create a fingerprint history manager.
 *
 * @returns FingerprintHistory instance with empty state.
 */
export function createFingerprintHistory(): FingerprintHistory {
  const records = new Map<string, FingerprintRecord>();

  return {
    isNew(fingerprint: string): boolean {
      return !records.has(fingerprint);
    },

    record(fingerprint: string, timestamp: number, message?: string): void {
      const existing = records.get(fingerprint);
      if (existing) {
        records.set(fingerprint, {
          ...existing,
          last_seen: Math.max(existing.last_seen, timestamp),
          total_occurrences: existing.total_occurrences + 1,
          last_message: message?.slice(0, 200) ?? existing.last_message,
        });
      } else {
        records.set(fingerprint, {
          fingerprint,
          first_seen: timestamp,
          last_seen: timestamp,
          total_occurrences: 1,
          last_message: message?.slice(0, 200),
        });
      }
    },

    getRecord(fingerprint: string): FingerprintRecord | null {
      return records.get(fingerprint) ?? null;
    },

    loadEntries(entries: readonly PersistedFingerprintEntry[]): void {
      for (const e of entries) {
        records.set(e.fingerprint, {
          fingerprint: e.fingerprint,
          first_seen: e.first_seen,
          last_seen: e.last_seen,
          total_occurrences: e.total_count,
        });
      }
    },

    exportEntries(): PersistedFingerprintEntry[] {
      return [...records.values()].map((r) => ({
        fingerprint: r.fingerprint,
        first_seen: r.first_seen,
        last_seen: r.last_seen,
        total_count: r.total_occurrences,
        last_message: r.last_message,
      }));
    },
  };
}
