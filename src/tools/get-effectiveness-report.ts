/**
 * MCP tool handler for get_effectiveness_report.
 *
 * Returns TracePulse's MEASURED lifecycle outcomes (confirmed-fix / recurrence /
 * suppressed rates) as {value, n, ci} with 95% Wilson intervals, version-stamped.
 * The honest counterpart to get_session_impact's modeled savings estimate.
 *
 * @see src/analysis/effectiveness-report.ts
 * @see TRP-84
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuditBuffer } from "@/store/audit-buffer.js";
import type { LifecycleFSM } from "@/store/lifecycle-fsm.js";
import type { LifecycleMetrics } from "@/store/lifecycle-metrics.js";
import { computeLifecycleMetrics } from "@/store/lifecycle-metrics.js";
import { computeEffectivenessReport } from "@/analysis/effectiveness-report.js";
import { computePerEpisodeCost } from "@/analysis/episode-cost.js";
import { VERSION } from "@/index.js";

const EMPTY_METRICS: LifecycleMetrics = {
  total_episodes: 0,
  suppressed_count: 0,
  resolved_count: 0,
  recurred_count: 0,
  suppressed_rate: 0,
  confirmed_fix_rate: 0,
  recurrence_rate: 0,
  mean_time_to_fix: 0,
};

/**
 * Handle get_effectiveness_report.
 *
 * @param auditBuffer - Audit trail (for TracePulse's own response-token volume).
 * @param lifecycleFsm - Lifecycle FSM to read episode outcomes from (optional).
 * @returns CallToolResult with the JSON effectiveness report.
 */
export function handleGetEffectivenessReport(
  auditBuffer: AuditBuffer,
  lifecycleFsm?: LifecycleFSM,
): CallToolResult {
  const metrics = lifecycleFsm ? computeLifecycleMetrics(lifecycleFsm) : EMPTY_METRICS;
  const tpResponseTokensTotal = auditBuffer
    .query(500)
    .reduce((sum, r) => sum + r.response_tokens, 0);
  // Per-episode cost (TRP-82) over all completed episodes; empty block when no FSM.
  const perEpisodeCost = computePerEpisodeCost(lifecycleFsm ? lifecycleFsm.getAllEpisodes() : []);
  const report = computeEffectivenessReport(metrics, { version: VERSION, tpResponseTokensTotal, perEpisodeCost });
  return { content: [{ type: "text", text: JSON.stringify(report) }] };
}
