/**
 * Environmental cost calculator for bug patterns.
 *
 * Estimates token waste, USD cost, energy (Wh), and CO₂ (g) for recurring error
 * patterns from the shared energy model. These are MODELED estimates (see
 * `provenance` on the result), not measured values.
 *
 * @see src/analysis/energy-model.ts for the shared constants (TRP-81)
 * @see .kiro/specs/m20-bug-patterns/requirements.md R6
 */

import {
  USD_PER_1K_TOKENS,
  WH_PER_1K_TOKENS,
  CO2_G_PER_WH,
  ENERGY_MODEL_SOURCES,
  ESTIMATE_PROVENANCE,
} from "@/analysis/energy-model.js";

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

/** Calculated environmental cost. All figures are modeled estimates (see `provenance`). */
export interface PatternCost {
  readonly total_tokens_wasted: number;
  readonly estimated_cost_usd: number;
  readonly energy_wh: number;
  readonly co2_g: number;
  /** Marks these figures as modeled, not measured. */
  readonly provenance: string;
  /** Citation for the constants used. */
  readonly sources: string;
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
    provenance: ESTIMATE_PROVENANCE,
    sources: ENERGY_MODEL_SOURCES,
  };
}
