/**
 * MCP tool handler for get_cross_layer_diagnosis.
 *
 * Aggregates signals from all layers (backend, frontend, git, process),
 * runs the correlation matcher against the pattern library, and returns
 * actionable diagnoses. This is the DevLoop Agent's primary interface.
 *
 * @see src/correlation/cross-layer/index.ts for the engine
 * @see .kiro/specs/devloop-agent/design.md for tool contract
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { FrontendErrorBuffer } from "@/correlation/frontend-error-buffer.js";
import type { AggregatorDeps } from "@/correlation/cross-layer/types.js";
import { aggregateSignals } from "@/correlation/cross-layer/signal-aggregator.js";
import { diagnose } from "@/correlation/cross-layer/correlation-matcher.js";
import { PATTERNS } from "@/correlation/cross-layer/pattern-library.js";
import { execGit, parseChangedFiles, detectGitRoot } from "@/correlation/git-diff-correlator.js";

/** Maximum time window allowed (5 minutes). */
const MAX_TIME_WINDOW_SECONDS = 300;

/** Default time window (60 seconds). */
const DEFAULT_TIME_WINDOW_SECONDS = 60;

/**
 * Handle get_cross_layer_diagnosis MCP tool call.
 *
 * Collects signals from all available layers, matches against the pattern
 * library, and returns top diagnoses sorted by confidence.
 *
 * @param buffer - Backend event buffer.
 * @param args - Tool input: { time_window_seconds?: number }.
 * @param cwd - Working directory for git operations.
 * @param frontendBuffer - Optional frontend error buffer.
 * @param lastBuildAt - Timestamp of last hot-reload/build event.
 * @returns MCP CallToolResult with diagnoses array.
 */
export async function handleGetCrossLayerDiagnosis(
  buffer: EventBuffer,
  args: Record<string, unknown>,
  cwd: string,
  frontendBuffer?: FrontendErrorBuffer,
  lastBuildAt?: number | null,
): Promise<CallToolResult> {
  // Validate time_window_seconds
  let timeWindowSeconds = DEFAULT_TIME_WINDOW_SECONDS;
  if (args.time_window_seconds !== undefined) {
    const tw = Number(args.time_window_seconds);
    if (isNaN(tw) || tw <= 0 || tw > MAX_TIME_WINDOW_SECONDS) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `time_window_seconds must be between 1 and ${MAX_TIME_WINDOW_SECONDS}`,
          }),
        }],
        isError: true,
      };
    }
    timeWindowSeconds = tw;
  }

  const since = Date.now() - timeWindowSeconds * 1000;

  // Build aggregator dependencies from available sources
  const deps: AggregatorDeps = {
    getBackendEvents: (s) => buffer.query({ since: s }),
    getFrontendErrors: (s) => frontendBuffer
      ? frontendBuffer.getAll().filter((e) => e.timestamp >= s)
      : [],
    getGitChanges: async (s) => {
      const gitRoot = await detectGitRoot(cwd);
      if (!gitRoot) return null;
      const output = await execGit(["diff", "--name-only", "HEAD"], gitRoot);
      if (!output) return null;
      return parseChangedFiles(output);
    },
    getLastHotReload: () => lastBuildAt ?? buffer.lastBuildAt,
    getLastRestart: () => null, // TODO: wire to process spawner restart tracking
    cwd,
  };

  // Aggregate signals from all layers
  const signals = await aggregateSignals(deps, since);

  // Run diagnosis
  const diagnoses = diagnose(signals, PATTERNS);

  // Determine which layers are active
  const activeLayers = [...new Set(signals.map((s) => s.layer))];

  // Build response
  const result: Record<string, unknown> = {
    diagnoses: diagnoses.map((d) => ({
      pattern_id: d.pattern_id,
      confidence: d.confidence,
      diagnosis: d.diagnosis,
      suggested_fix: d.suggested_fix,
      layers_involved: d.layers_involved,
    })),
    signals_collected: signals.length,
    layers_active: activeLayers,
  };

  // Add helpful context when no diagnosis found
  if (diagnoses.length === 0) {
    if (signals.length === 0) {
      result.no_diagnosis_reason = "No signals in the time window. The server may be idle, or no errors have occurred recently.";
    } else {
      result.no_diagnosis_reason = `${signals.length} signal(s) collected from ${activeLayers.join(", ")} but no known cross-layer pattern matched. The issue may be single-layer — try get_errors or get_correlated_errors.`;
    }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result),
    }],
  };
}
