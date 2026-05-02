/**
 * Pattern injector for get_errors responses.
 *
 * Annotates RuntimeEvents with cross-session pattern data when available.
 * Adds a `patterns` field to events whose fingerprints have known patterns.
 * Cost: ~50 tokens per annotated error. Saves ~3,000 tokens per avoided re-investigation.
 *
 * @see src/analysis/pattern-analyzer.ts for pattern detection
 * @see .kiro/specs/m20-bug-patterns/requirements.md R4
 */

import type { RuntimeEvent } from "@/types/events.js";
import type { PatternAnalyzer } from "@/analysis/pattern-analyzer.js";

/** Pattern annotation added to a RuntimeEvent. */
export interface PatternAnnotation {
  readonly recurring?: { sessions: number; total_occurrences: number };
  readonly flaky?: { presence_rate: number };
  readonly fixed_but_back?: { clean_sessions: number };
}

/** RuntimeEvent extended with optional pattern annotation. */
export type AnnotatedEvent = RuntimeEvent & { patterns?: PatternAnnotation };

/**
 * Annotate events with cross-session pattern data.
 *
 * Runs the analyzer once, then checks each event's fingerprint against
 * the detected patterns. Only adds the `patterns` field when a match exists.
 *
 * @param events - Events from get_errors query.
 * @param analyzer - PatternAnalyzer with loaded session history.
 * @returns Events with optional `patterns` field added.
 */
export function annotateWithPatterns(
  events: readonly RuntimeEvent[],
  analyzer: PatternAnalyzer,
): AnnotatedEvent[] {
  const analysis = analyzer.analyze();

  // Build lookup maps for O(1) per-event annotation
  const recurringMap = new Map(analysis.recurring.map(r => [r.fingerprint, r]));
  const flakyMap = new Map(analysis.flaky.map(f => [f.fingerprint, f]));
  const fixedBackMap = new Map(analysis.fixed_but_back.map(fb => [fb.fingerprint, fb]));

  return events.map(event => {
    const annotation: PatternAnnotation = {};
    let hasPattern = false;

    const recurring = recurringMap.get(event.fingerprint);
    if (recurring) {
      (annotation as { recurring: unknown }).recurring = { sessions: recurring.sessions, total_occurrences: recurring.total_occurrences };
      hasPattern = true;
    }

    const flaky = flakyMap.get(event.fingerprint);
    if (flaky) {
      (annotation as { flaky: unknown }).flaky = { presence_rate: flaky.presence_rate };
      hasPattern = true;
    }

    const fixedBack = fixedBackMap.get(event.fingerprint);
    if (fixedBack) {
      (annotation as { fixed_but_back: unknown }).fixed_but_back = { clean_sessions: fixedBack.clean_sessions };
      hasPattern = true;
    }

    return hasPattern ? { ...event, patterns: annotation } : event;
  });
}
