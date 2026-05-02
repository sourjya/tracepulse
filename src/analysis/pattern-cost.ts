/**
 * Environmental cost calculator for bug patterns.
 *
 * Estimates token waste, USD cost, energy (Wh), and CO2 (g) for
 * recurring error patterns. Constants from published research:
 * - Token cost: $0.003/1K input tokens (Claude Sonnet 2026)
 * - Energy: 0.034 Wh per 1K tokens (arXiv 2512.03024)
 * - CO2: 0.4 g/Wh (IEA 2025 global grid average)
 *
 * @see .kiro/specs/m20-bug-patterns/requirements.md R6
 */

// ──────────────────────────────────────────────
// Constants (from published research)
// ──────────────────────────────────────────────

/** USD per 1K input tokens (Claude Sonnet pricing, 2026). */
const USD_PER_1K_TOKENS = 0.003;
/** Watt-hours per 1K tokens (arXiv 2512.03024). */
const WH_PER_1K_TOKENS = 0.034;
/** Grams CO2 per Wh (IEA 2025 global grid average). */
const CO2_G_PER_WH = 0.4;

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Input for cost calculation. */
export interface PatternCostInput {
  readonly sessions_affected: number;
  readonly total_occurrences: number;
  /** Estimated tokens spent per re-investigation of this error. */
  readonly tokens_per_investigation: number;
}

/** Calculated environmental cost. */
export interface PatternCost {
  readonly total_tokens_wasted: number;
  readonly estimated_cost_usd: number;
  readonly energy_wh: number;
  readonly co2_g: number;
}

// ──────────────────────────────────────────────
// Calculator
// ──────────────────────────────────────────────

/**
 * Calculate environmental cost of a bug pattern.
 *
 * @param input - Pattern metrics (sessions, occurrences, tokens per investigation).
 * @returns Calculated cost in tokens, USD, Wh, and CO2 grams.
 */
export function calculatePatternCost(input: PatternCostInput): PatternCost {
  const totalTokens = input.total_occurrences * input.tokens_per_investigation;
  const kTokens = totalTokens / 1000;

  return {
    total_tokens_wasted: totalTokens,
    estimated_cost_usd: Math.round(kTokens * USD_PER_1K_TOKENS * 1000) / 1000,
    energy_wh: Math.round(kTokens * WH_PER_1K_TOKENS * 100) / 100,
    co2_g: Math.round(kTokens * WH_PER_1K_TOKENS * CO2_G_PER_WH * 100) / 100,
  };
}
