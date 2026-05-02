/**
 * Compact field name transformer for token-efficient responses.
 *
 * Renames verbose RuntimeEvent fields to short stable keys:
 * signal_score -> ss, fingerprint -> fp, occurrence_count -> oc,
 * message -> msg, timestamp -> ts, context -> ctx.
 * Omits raw field (saves ~100 tokens per event).
 *
 * Activated via verbosity: 'compact' parameter on tools.
 * Saves 10-20% response size.
 *
 * @see .kiro/specs/m18-token-wave2/requirements.md W2.5
 */

import type { RuntimeEvent } from "@/types/events.js";

/** Compact event shape with short field names. */
export interface CompactEvent {
  readonly id: string;
  readonly ts: number;
  readonly src: string;
  readonly svc: string;
  readonly lvl: string;
  readonly msg: string;
  readonly fp: string;
  readonly ss: number;
  readonly ctx: Record<string, unknown>;
  readonly oc: number;
}

/**
 * Transform a RuntimeEvent into compact form.
 *
 * @param event - Full RuntimeEvent.
 * @returns CompactEvent with short field names, raw omitted.
 */
export function compactEvent(event: RuntimeEvent): CompactEvent {
  return {
    id: event.id,
    ts: event.timestamp,
    src: event.source,
    svc: event.service,
    lvl: event.level,
    msg: event.message,
    fp: event.fingerprint,
    ss: event.signal_score,
    ctx: event.context,
    oc: event.occurrence_count,
  };
}

/**
 * Transform an array of RuntimeEvents into compact form.
 *
 * @param events - Full RuntimeEvents.
 * @returns Array of CompactEvents.
 */
export function compactEvents(events: readonly RuntimeEvent[]): CompactEvent[] {
  return events.map(compactEvent);
}
