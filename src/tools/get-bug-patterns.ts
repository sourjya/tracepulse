/**
 * MCP tool handler for get_bug_patterns.
 *
 * Returns all detected bug patterns from the PatternAnalyzer.
 * Patterns include recurring, velocity, chains, flaky, fixed-but-back,
 * and degradation. Each pattern type has its own detection logic.
 *
 * @see src/analysis/pattern-analyzer.ts for detection algorithms
 * @see .kiro/specs/m20-bug-patterns/requirements.md for R2
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PatternAnalyzer } from "@/analysis/pattern-analyzer.js";
import { calculatePatternCost } from "@/analysis/pattern-cost.js";
import { jsonResult } from "@/mcp/response-helpers.js";

/**
 * Handle get_bug_patterns tool call.
 *
 * Runs all pattern detectors and returns structured results with
 * environmental cost estimates per pattern.
 *
 * @param analyzer - PatternAnalyzer with loaded session data.
 * @returns CallToolResult with JSON patterns object.
 */
export function handleGetBugPatterns(analyzer: PatternAnalyzer): CallToolResult {
  const analysis = analyzer.analyze();

  // Calculate cost for recurring patterns (highest value)
  const recurringWithCost = analysis.recurring.map(r => ({
    ...r,
    token_cost: calculatePatternCost({
      sessions_affected: r.sessions,
      total_occurrences: r.total_occurrences,
      tokens_per_investigation: 1000,
    }),
  }));

  return jsonResult({
    patterns: {
      recurring: recurringWithCost,
      velocity: analysis.velocity,
      chains: analysis.chains,
      flaky: analysis.flaky,
      fixed_but_back: analysis.fixed_but_back,
      degradation: analysis.degradation,
    },
    summary: analysis.summary,
  });
}
