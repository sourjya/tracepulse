/**
 * Cross-layer signal aggregator.
 *
 * Collects signals from all available layers (backend, frontend, git, process)
 * and normalizes them into a unified LayerSignal[] sorted by timestamp.
 * This is the input stage for the correlation matcher.
 *
 * Each layer collector is best-effort: if a source is unavailable (e.g., git
 * not installed, no frontend errors), it returns empty rather than failing.
 *
 * @see .kiro/specs/devloop-agent/design.md for architecture
 * @see src/correlation/cross-layer/types.ts for AggregatorDeps interface
 */

import type { RuntimeEvent } from "@/types/events.js";
import type { FrontendError } from "@/correlation/types.js";
import type { AggregatorDeps, LayerSignal, SignalSnapshot } from "@/correlation/cross-layer/types.js";

// ──────────────────────────────────────────────
// Backend Signal Collection
// ──────────────────────────────────────────────

/** Threshold for occurrence_count to emit a repeated-error signal. */
const REPEATED_ERROR_THRESHOLD = 3;

/**
 * Convert backend RuntimeEvents into LayerSignals.
 *
 * Maps events based on http_status context and level:
 * - service === "frontend" → frontend layer (crash bridge events)
 * - http_status present → http-{status} or http-{category}
 * - error level without http_status → exception
 * - occurrence_count >= 3 → additional repeated-error signal
 */
function collectBackendSignals(events: RuntimeEvent[]): LayerSignal[] {
  const signals: LayerSignal[] = [];

  for (const event of events) {
    // Frontend crash bridge events go to frontend layer as type-error
    if (event.service === "frontend") {
      signals.push({
        layer: "frontend",
        type: "type-error",
        timestamp: event.timestamp,
        detail: event.message,
        metadata: {
          error_type: event.context.error_type,
          file: event.context.file,
          line: event.context.line,
          error_message: event.message.replace("[Frontend] ", ""),
        },
      });
      continue;
    }

    const httpStatus = event.context.http_status;

    if (httpStatus) {
      // HTTP status-based signal
      const type = `http-${httpStatus}`;
      signals.push({
        layer: "backend",
        type,
        timestamp: event.timestamp,
        detail: event.message,
        metadata: {
          status: httpStatus,
          path: extractPathFromMessage(event.message) ?? extractPathFromMessage(event.raw),
          fingerprint: event.fingerprint,
        },
      });
    } else if (event.level === "error") {
      // Non-HTTP error → exception
      signals.push({
        layer: "backend",
        type: "exception",
        timestamp: event.timestamp,
        detail: event.message,
        metadata: {
          error_type: event.context.error_type,
          file: event.context.file,
          line: event.context.line,
          fingerprint: event.fingerprint,
        },
      });
    }

    // Emit repeated-error signal for high-occurrence events
    if (event.occurrence_count >= REPEATED_ERROR_THRESHOLD) {
      signals.push({
        layer: "backend",
        type: "repeated-error",
        timestamp: event.timestamp,
        detail: `${event.message} (${event.occurrence_count}x)`,
        metadata: {
          occurrence_count: event.occurrence_count,
          fingerprint: event.fingerprint,
        },
      });
    }
  }

  return signals;
}

// ──────────────────────────────────────────────
// Frontend Signal Collection
// ──────────────────────────────────────────────

/**
 * Convert frontend errors into LayerSignals.
 *
 * Maps FrontendError objects based on status code and type.
 */
function collectFrontendSignals(errors: FrontendError[]): LayerSignal[] {
  return errors.map((fe) => ({
    layer: "frontend" as const,
    type: fe.statusCode >= 400 ? "http-failure" : "type-error",
    timestamp: fe.timestamp,
    detail: `${fe.method} ${fe.path} ${fe.statusCode} ${fe.statusText}`,
    metadata: {
      statusCode: fe.statusCode,
      path: fe.path,
      method: fe.method,
      url: fe.url,
      error_message: fe.responseBodySnippet,
    },
  }));
}

// ──────────────────────────────────────────────
// Git Signal Collection
// ──────────────────────────────────────────────

/**
 * Convert git changed files into a single file-changed LayerSignal.
 * Returns empty if git is unavailable or no changes detected.
 */
function collectGitSignals(changedFiles: string[] | null, since: number): LayerSignal[] {
  if (!changedFiles || changedFiles.length === 0) return [];

  return [
    {
      layer: "git",
      type: "file-changed",
      // Use `since` as approximate timestamp since git doesn't give us exact edit time
      timestamp: since,
      detail: `${changedFiles.length} file(s) changed: ${changedFiles.slice(0, 3).join(", ")}${changedFiles.length > 3 ? "..." : ""}`,
      metadata: {
        files: changedFiles,
        count: changedFiles.length,
      },
    },
  ];
}

// ──────────────────────────────────────────────
// Process Signal Collection
// ──────────────────────────────────────────────

/**
 * Collect process state signals (hot-reload, restart, stale server).
 *
 * Logic:
 * - If lastHotReload is within the time window → hot-reload signal
 * - If git has changes but no reload/restart within window → no-restart-detected
 */
function collectProcessSignals(
  lastHotReload: number | null,
  lastRestart: number | null,
  since: number,
  hasGitChanges: boolean,
): LayerSignal[] {
  const signals: LayerSignal[] = [];
  const now = Date.now();

  // Recent hot-reload detected
  if (lastHotReload && lastHotReload >= since) {
    signals.push({
      layer: "process",
      type: "hot-reload",
      timestamp: lastHotReload,
      detail: "Hot-reload detected",
      metadata: { lastHotReload },
    });
  }

  // Stale server: git changes exist but no recent reload or restart
  if (hasGitChanges) {
    const lastActivity = Math.max(lastHotReload ?? 0, lastRestart ?? 0);
    if (lastActivity < since) {
      signals.push({
        layer: "process",
        type: "no-restart-detected",
        timestamp: now,
        detail: "Code changed but server has not restarted",
        metadata: { lastHotReload, lastRestart },
      });
    }
  }

  return signals;
}

// ──────────────────────────────────────────────
// Unified Aggregator
// ──────────────────────────────────────────────

/**
 * Aggregate signals from all layers into a unified sorted array.
 *
 * Calls each layer collector with the provided dependencies, merges results,
 * and sorts by timestamp ascending. Best-effort: unavailable layers produce
 * empty arrays rather than errors. Returns a SignalSnapshot with metadata
 * about which layers contributed and which failed.
 *
 * @param deps - Injected dependencies for each layer.
 * @param since - Unix ms cutoff. Only signals after this time are collected.
 * @returns SignalSnapshot with signals, timestamp, and missing layer info.
 */
export async function aggregateSignals(
  deps: AggregatorDeps,
  since: number,
): Promise<SignalSnapshot> {
  const snapshotTimestamp = Date.now();

  // Collect from all layers in parallel where possible
  const [backendEvents, frontendErrors, gitChanges] = await Promise.all([
    Promise.resolve(deps.getBackendEvents(since)),
    Promise.resolve(deps.getFrontendErrors(since)),
    deps.getGitChanges(since),
  ]);

  const lastHotReload = deps.getLastHotReload();
  const lastRestart = deps.getLastRestart();
  const hasGitChanges = gitChanges !== null && gitChanges.length > 0;

  // Collect signals from each layer
  const backend = collectBackendSignals(backendEvents);
  const frontend = collectFrontendSignals(frontendErrors);
  const git = collectGitSignals(gitChanges, since);
  const process = collectProcessSignals(lastHotReload, lastRestart, since, hasGitChanges);

  // Track which layers are missing (failed or returned empty)
  const missingSignals: string[] = [];
  if (backend.length === 0) missingSignals.push("backend");
  if (frontend.length === 0) missingSignals.push("frontend");
  if (gitChanges === null) missingSignals.push("git");

  // Merge and sort by timestamp ascending
  const all = [...backend, ...frontend, ...git, ...process];
  all.sort((a, b) => a.timestamp - b.timestamp);

  const activeLayers = [...new Set(all.map((s) => s.layer))];

  return {
    signals: all,
    snapshot_timestamp: snapshotTimestamp,
    missing_signals: missingSignals,
    active_layers: activeLayers,
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Extract a URL path from a log message (e.g., "GET /api/users 200"). */
function extractPathFromMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const match = message.match(/(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S+)/i);
  return match?.[1];
}
