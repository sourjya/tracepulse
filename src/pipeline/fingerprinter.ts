/**
 * Fingerprinter — generates stable dedup keys for RuntimeEvents.
 *
 * Produces a SHA-256 hex digest from source + normalized message + file:line.
 * Message normalization strips volatile content (timestamps, PIDs, memory
 * addresses, UUIDs) so logically identical errors always hash to the same key,
 * regardless of when or which process instance produced them.
 *
 * Used by the normalizer stage to populate RuntimeEvent.fingerprint, and by
 * the ring buffer for dedup/occurrence counting.
 *
 * @see src/types/events.ts for RuntimeEvent.fingerprint field
 */

import { createHash } from "node:crypto";

// ──────────────────────────────────────────────
// Normalization Patterns
// ──────────────────────────────────────────────

/**
 * Patterns stripped from messages before hashing.
 * Order matters — timestamps must be stripped before the generic
 * Unix-timestamp pattern to avoid partial matches.
 */
const NORMALIZATION_PATTERNS: readonly RegExp[] = [
  /* ISO 8601 timestamps: 2026-04-27T12:00:00.000Z or 2026-04-27T12:00:00Z */
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g,
  /* Unix timestamps: 10+ digit numbers (epoch ms or s) */
  /\b\d{10,}\b/g,
  /* PID patterns: pid=12345, PID: 12345 (case-insensitive) */
  /\bpid[=:\s]+\d+/gi,
  /* Memory addresses: 0x7fff5fbff8a0 */
  /0x[0-9a-f]+/gi,
  /* UUIDs: 8-4-4-4-12 hex */
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
];

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Normalize a message for fingerprinting by stripping volatile content.
 *
 * Removes timestamps, PIDs, memory addresses, and UUIDs, then collapses
 * whitespace and trims. Exported separately so normalization logic can be
 * unit-tested independently of the hashing step.
 *
 * @param message - Raw error message to normalize
 * @returns Cleaned message suitable for stable hashing
 */
export function normalizeForFingerprint(message: string): string {
  let result = message;
  for (const pattern of NORMALIZATION_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result.replace(/\s+/g, " ").trim();
}

/**
 * Generate a stable SHA-256 fingerprint from event properties.
 *
 * The fingerprint is deterministic: identical (source, message, file, line)
 * tuples always produce the same hex digest. Volatile content in the message
 * is stripped via normalizeForFingerprint before hashing.
 *
 * @param source  - Event source (e.g., 'server-stderr')
 * @param message - Raw error message (will be normalized)
 * @param file    - Source file path, if known
 * @param line    - Line number in the source file, if known
 * @returns 64-character lowercase hex SHA-256 digest
 */
export function fingerprint(
  source: string,
  message: string,
  file?: string,
  line?: number,
): string {
  const normalized = normalizeForFingerprint(message);
  const input = `${source}|${normalized}|${file ?? ""}:${line ?? ""}`;
  return createHash("sha256").update(input).digest("hex");
}
