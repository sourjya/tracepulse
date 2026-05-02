/**
 * Semantic error grouping by file:line location.
 *
 * Groups errors sharing the same user-code file:line into a single
 * representative event with variant_count. Reduces duplicate entries
 * in get_errors responses. The highest-scoring event is kept as the
 * group representative.
 *
 * Saves ~500 tokens/session by collapsing related errors.
 *
 * @see .kiro/specs/m18-token-wave2/requirements.md W2.6
 */

import type { RuntimeEvent } from "@/types/events.js";

/** RuntimeEvent extended with optional variant count. */
export type GroupedEvent = RuntimeEvent & { variant_count?: number };

/**
 * Group errors by file:line location.
 *
 * Events with the same file + line in their context are collapsed into
 * a single entry. The highest-scoring event becomes the representative.
 * Events without file:line context pass through ungrouped.
 *
 * @param events - Events to group.
 * @returns Grouped events with variant_count on collapsed entries.
 */
export function groupByLocation(events: readonly RuntimeEvent[]): GroupedEvent[] {
  const groups = new Map<string, RuntimeEvent[]>();
  const ungrouped: RuntimeEvent[] = [];

  for (const event of events) {
    const file = event.context.file as string | undefined;
    const line = event.context.line as number | undefined;

    if (file && line !== undefined) {
      const key = `${file}:${line}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(event);
    } else {
      ungrouped.push(event);
    }
  }

  const result: GroupedEvent[] = [];

  for (const members of groups.values()) {
    if (members.length === 1) {
      // Single event at this location - no grouping needed
      result.push(members[0]);
    } else {
      // Multiple events - pick highest score as representative
      members.sort((a, b) => b.signal_score - a.signal_score);
      result.push({ ...members[0], variant_count: members.length });
    }
  }

  // Add ungrouped events
  result.push(...ungrouped);

  return result;
}
