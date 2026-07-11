/**
 * Journal bridge — integration layer between the ring buffer and the event journal.
 *
 * Subscribes to the ring buffer's event stream and writes relevant events
 * (errors, warnings) to the append-only JSONL journal. Handles:
 * - Session lifecycle (session_start on creation, session_end on shutdown)
 * - Event filtering (only error/warn events are journaled)
 * - Message truncation (200 char cap for security)
 * - Startup compaction (compact previous session's journal into telemetry.json)
 * - Graceful shutdown with unsubscribe
 *
 * Architecture role: This is the glue between the live pipeline (ring buffer)
 * and the persistent journal (events.jsonl). It ensures that every significant
 * event is written to disk synchronously, surviving crashes.
 *
 * @see src/persistence/event-journal.ts for the journal writer
 * @see src/store/ring-buffer.ts for the event source
 * @see .kiro/specs/m27-event-journal/design.md for architecture
 */

import type { RuntimeEvent } from "@/types/events.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { JournalEntry } from "@/persistence/journal-types.js";
import { createEventJournal, compactJournal } from "@/persistence/event-journal.js";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Configuration for the journal bridge. */
export interface JournalBridgeConfig {
  /** Path to the JSONL journal file. */
  readonly journalPath: string;
  /** Path to the telemetry summary file (compaction output). */
  readonly telemetryPath: string;
  /** The ring buffer to subscribe to for new events. */
  readonly buffer: EventBuffer;
  /** Optional agent info from MCP initialize handshake. */
  readonly agentInfo?: { readonly name: string; readonly version?: string };
  /** Optional project type for session metadata. */
  readonly projectType?: string;
}

/** Public API for the journal bridge. */
export interface JournalBridge {
  /**
   * Gracefully shut down the journal bridge.
   * Writes a session_end entry, unsubscribes from the buffer.
   * Idempotent — safe to call multiple times.
   */
  shutdown(): void;

  /** Get the session ID for this bridge instance. */
  readonly sessionId: string;

  /** Number of events journaled in this session. */
  readonly eventCount: number;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** Maximum message length stored in journal entries (security: no full stack traces on disk). */
const MAX_JOURNAL_MESSAGE_LENGTH = 200;

// ──────────────────────────────────────────────
// Implementation
// ──────────────────────────────────────────────

/**
 * Create a journal bridge that connects the ring buffer to the event journal.
 *
 * On creation:
 * 1. If a journal file exists from a previous session, compact it into telemetry.json
 * 2. Write a session_start entry
 * 3. Subscribe to the buffer for new events
 *
 * @param config - Configuration including paths, buffer, and optional metadata.
 * @returns JournalBridge instance.
 */
export function createJournalBridge(config: JournalBridgeConfig): JournalBridge {
  const { journalPath, telemetryPath, buffer, agentInfo, projectType } = config;
  const sessionId = new Date().toISOString();
  const startedAt = Date.now();
  let eventCount = 0;
  let isShutDown = false;

  // Step 1: Compact existing journal (from previous session/crash)
  try {
    compactJournal(journalPath, telemetryPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[tracepulse] Warning: journal compaction failed: ${msg}\n`);
  }

  // Step 2: Create fresh journal for this session
  const journal = createEventJournal(journalPath);

  // Step 3: Write session_start
  try {
    const startEntry: JournalEntry = {
      type: "session_start",
      ts: startedAt,
      sid: sessionId,
      data: {
        ...(agentInfo ? { agent: agentInfo } : {}),
        ...(projectType ? { project_type: projectType } : {}),
      },
    };
    journal.append(startEntry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[tracepulse] Warning: failed to write session_start: ${msg}\n`);
  }

  // Step 4: Subscribe to buffer — journal error/warn events
  const unsubscribe = buffer.subscribe((event: RuntimeEvent) => {
    if (isShutDown) return;

    // Only journal error and warn level events
    if (event.level !== "error" && event.level !== "warn") return;

    try {
      const entry: JournalEntry = {
        type: "error",
        ts: event.timestamp,
        sid: sessionId,
        data: {
          fingerprint: event.fingerprint,
          level: event.level,
          message: event.message.slice(0, MAX_JOURNAL_MESSAGE_LENGTH),
          signal_score: event.signal_score,
          source: event.source,
          service: event.service,
          ...(event.context.file || event.context.line || event.context.error_type
            ? {
                context: {
                  ...(event.context.file ? { file: event.context.file } : {}),
                  ...(event.context.line ? { line: event.context.line } : {}),
                  ...(event.context.error_type ? { error_type: event.context.error_type } : {}),
                },
              }
            : {}),
        },
      };
      journal.append(entry);
      eventCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[tracepulse] Warning: failed to journal event: ${msg}\n`);
    }
  });

  return {
    shutdown(): void {
      if (isShutDown) return;
      isShutDown = true;

      // Unsubscribe from buffer to stop receiving events
      unsubscribe();

      // Write session_end entry
      try {
        const endEntry: JournalEntry = {
          type: "session_end",
          ts: Date.now(),
          sid: sessionId,
          data: {
            duration_ms: Date.now() - startedAt,
            errors_surfaced: eventCount,
            errors_suppressed: 0, // Will be populated by FSM integration later
            errors_resolved: 0,   // Will be populated by FSM integration later
          },
        };
        journal.append(endEntry);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[tracepulse] Warning: failed to write session_end: ${msg}\n`);
      }
    },

    get sessionId(): string {
      return sessionId;
    },

    get eventCount(): number {
      return eventCount;
    },
  };
}
