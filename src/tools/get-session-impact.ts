/**
 * MCP tool handler for get_session_impact - environmental report.
 *
 * Calculates token savings, energy savings, and CO2 reduction
 * from TracePulse usage in the current session. Based on published
 * energy-per-token research.
 *
 * @see .kiro/specs/m17-token-wave1/requirements.md W1.7
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuditBuffer } from "@/store/audit-buffer.js";
import { WH_PER_1K_TOKENS, CO2_G_PER_WH, ENERGY_MODEL_SOURCES, ESTIMATE_PROVENANCE } from "@/analysis/energy-model.js";

/**
 * Counterfactual multipliers: an ASSUMPTION of how many tokens the agent would have
 * spent WITHOUT TracePulse for the same task. These are NOT measured against a control
 * arm — they are modeled constants (12× for error investigation, 3× for other tools).
 * Treat every number derived from them as `estimated`, not observed. Replacing these
 * with an observed per-episode measurement is tracked in TRP-82/TRP-85.
 */
const ERROR_TOOL_MULTIPLIER = 12;
const OTHER_TOOL_MULTIPLIER = 3;

const ERROR_TOOLS = new Set([
  "get_errors", "get_error_context", "get_new_errors", "get_error_trends",
  "get_error_clusters", "get_correlated_errors", "correlate_with_diff",
]);

/**
 * Handle get_session_impact MCP tool call.
 *
 * @param auditBuffer - Audit trail with tool usage data.
 * @returns Environmental impact report.
 */
export function handleGetSessionImpact(
  auditBuffer: AuditBuffer,
): CallToolResult {
  const records = auditBuffer.query(500);
  const totalCalls = auditBuffer.totalInvocations;
  const totalResponseTokens = records.reduce((sum, r) => sum + r.response_tokens, 0);

  // Estimate tokens saved: what would the agent have consumed without TP?
  let estimatedWithoutTP = 0;
  for (const r of records) {
    const multiplier = ERROR_TOOLS.has(r.tool) ? ERROR_TOOL_MULTIPLIER : OTHER_TOOL_MULTIPLIER;
    estimatedWithoutTP += r.response_tokens * multiplier;
  }
  const tokensSaved = Math.max(0, estimatedWithoutTP - totalResponseTokens);

  // Energy and carbon calculations
  const energySavedWh = (tokensSaved / 1000) * WH_PER_1K_TOKENS;
  const co2SavedG = energySavedWh * CO2_G_PER_WH;

  // Human-readable equivalent
  const googleSearches = Math.round(energySavedWh / 0.3); // ~0.3 Wh per Google search

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        total_tool_calls: totalCalls,
        total_response_tokens: totalResponseTokens,
        estimated_without_tp: estimatedWithoutTP,
        estimated_tokens_saved: tokensSaved,
        energy_saved_wh: Math.round(energySavedWh * 100) / 100,
        co2_saved_g: Math.round(co2SavedG * 100) / 100,
        equivalent: googleSearches > 0 ? `${googleSearches} Google searches` : "minimal",
        provenance: ESTIMATE_PROVENANCE,
        methodology: `ASSUMED 12× token reduction for error tools, 3× for other tools (not measured against a control arm). ${ENERGY_MODEL_SOURCES}.`,
      }),
    }],
  };
}
