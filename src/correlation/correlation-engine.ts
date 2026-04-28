/**
 * Cross-service temporal correlation engine.
 *
 * Groups events from different services that occur within a configurable
 * time window. Only groups spanning multiple services get a correlation_group
 * ID - single-service clusters are left unannotated.
 *
 * @see .kiro/specs/phase3-multi-process/design.md for correlation design
 */

import { createHash } from "node:crypto";
import type { RuntimeEvent } from "@/types/events.js";

/** RuntimeEvent extended with optional correlation group. */
export interface CorrelatedEvent extends RuntimeEvent {
  readonly correlation_group?: string;
}

/**
 * Correlate events by temporal proximity across services.
 *
 * Sorts events by timestamp, groups consecutive events within windowMs,
 * and assigns a deterministic correlation_group ID to groups that span
 * multiple services.
 *
 * @param events - Events to correlate.
 * @param windowMs - Maximum time gap (ms) between events in a group.
 * @returns Events sorted by timestamp with correlation_group annotations.
 */
export function correlateEvents(
  events: readonly RuntimeEvent[],
  windowMs: number,
): CorrelatedEvent[] {
  if (events.length === 0) return [];

  // Sort by timestamp ascending
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  // Group consecutive events within windowMs
  const groups: RuntimeEvent[][] = [];
  let currentGroup: RuntimeEvent[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].timestamp - sorted[i - 1].timestamp <= windowMs) {
      currentGroup.push(sorted[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  groups.push(currentGroup);

  // Annotate groups that span multiple services
  const result: CorrelatedEvent[] = [];
  for (const group of groups) {
    const services = new Set(group.map((e) => e.service));
    if (services.size > 1) {
      // Deterministic group ID from sorted event IDs
      const groupId = createHash("sha256")
        .update(group.map((e) => e.id).sort().join(":"))
        .digest("hex")
        .slice(0, 12);

      for (const event of group) {
        result.push({ ...event, correlation_group: `cg:${groupId}` });
      }
    } else {
      for (const event of group) {
        result.push(event);
      }
    }
  }

  return result;
}
