/**
 * Shared test helper for creating RuntimeEvent fixtures.
 *
 * Eliminates the makeEvent() duplication across 24+ test files.
 * All test files should import from here instead of defining their own.
 *
 * @see docs/decisions/ADR-002-golden-file-testing.md for fixture strategy
 */

import type { RuntimeEvent } from "@/types/events.js";

/**
 * Create a RuntimeEvent with sensible defaults. Override any field.
 *
 * @param overrides - Partial RuntimeEvent fields to override defaults.
 * @returns A complete RuntimeEvent suitable for testing.
 */
export function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    timestamp: now,
    source: "server-stderr",
    service: "main",
    level: "error",
    message: "Test error",
    raw: "Test error",
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    signal_score: 60,
    signal_strength: "high" as const,
    occurrence_count: 1,
    first_seen: now,
    context: {},
    ...overrides,
  };
}
