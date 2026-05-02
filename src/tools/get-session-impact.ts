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

/**
 * Energy constants from published research.
 * - 0.34 Wh per LLM query (ChatGPT avg, June 2025)
 * - ~1,000 tokens per query average
 * - 0.4 gCO2e per Wh (US grid average)
 */
const WH_PER_1K_TOKENS = 0.34;
const CO2_G_PER_WH = 0.4;

/**
 * Estimated tokens the agent would have consumed WITHOUT TracePulse
 * for the same task. Based on measured session data:
 * - Manual log reading: ~12,000 tokens per error investigation
 * - TracePulse structured response: ~1,000 tokens per error
 * - Ratio: 12x savings per error-related call
 * - Non-error calls (health, build): ~3x savings
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
        methodology: "Based on 12x token reduction for error tools, 3x for other tools. Energy: 0.34 Wh/1K tokens (ChatGPT avg). CO2: 0.4 gCO2e/Wh (US grid avg).",
      }),
    }],
  };
}
