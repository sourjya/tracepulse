/**
 * Types for the log collector subsystem.
 *
 * Defines the Collector interface implemented by ProcessSpawner and
 * LogFileTailer. The pipeline consumes lines from collectors without
 * knowing the source type.
 *
 * @see Phase 1 design.md for collector design
 */

import type { EventSource } from "@/constants/events.js";

/**
 * Common interface for all log collectors.
 * The pipeline calls start() and receives lines via the onLine callback.
 */
export interface Collector {
  /** Start collecting. Calls onLine for each new line. */
  start(onLine: (source: EventSource, line: string) => void): Promise<void>;
  /** Stop collecting. Clean up resources. */
  stop(): Promise<void>;
  /** Whether the collector is actively receiving data. */
  isConnected(): boolean;
}

/**
 * Interface for the event buffer that stores RuntimeEvents.
 * Implemented by the ring buffer. MCP tool handlers read from this.
 */
export interface EventBuffer {
  /** Add an event. If fingerprint exists, update occurrence_count instead. */
  push(event: import("@/types/events.js").RuntimeEvent): void;
  /** Query events matching filters. Returns newest first. */
  query(filters: import("@/types/events.js").EventFilters): import("@/types/events.js").RuntimeEvent[];
  /** Count of events matching filters. */
  count(filters?: import("@/types/events.js").EventFilters): number;
  /** Remove all events. Returns count of removed events. */
  clear(): number;
  /** Remove events matching a specific fingerprint. Returns count removed. */
  clearByFingerprint(fingerprint: string): number;
  /** Current number of events in the buffer. */
  readonly size: number;
  /** Subscribe to new events. Returns an unsubscribe function. Only called for new events, not dedup updates. */
  subscribe(callback: (event: import("@/types/events.js").RuntimeEvent) => void): () => void;
  /** Unix ms when this buffer was created (session start). */
  readonly sessionStartedAt: number;
  /** Unix ms when clear() was last called, or null if never cleared. */
  readonly bufferClearedAt: number | null;
  /** Timestamp of the oldest event in the buffer, or null if empty. */
  readonly oldestEventAt: number | null;
  /** Unix ms when the last hot-reload/build-success event was seen, or null. */
  readonly lastBuildAt: number | null;
}
