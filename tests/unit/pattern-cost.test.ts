/**
 * Tests for per-pattern environmental cost calculation.
 *
 * @see src/analysis/pattern-cost.ts for implementation
 */

import { describe, it, expect } from "vitest";
import { calculatePatternCost } from "@/analysis/pattern-cost.js";

describe("calculatePatternCost", () => {
  it("calculates token waste for recurring patterns", () => {
    const cost = calculatePatternCost({
      sessions_affected: 5,
      total_occurrences: 50,
      tokens_per_investigation: 1000,
    });

    expect(cost.total_tokens_wasted).toBe(50000);
    expect(cost.estimated_cost_usd).toBeGreaterThan(0);
    // Reconciled shared constant (TRP-81): 50k tokens → 1.7 Wh → 0.68 g CO₂.
    expect(cost.energy_wh).toBe(1.7);
    expect(cost.co2_g).toBe(0.68);
    // Modeled figures carry a provenance label + citation (TRP-81).
    expect(cost.provenance).toContain("estimated");
    expect(cost.sources).toContain("arXiv");
  });

  it("returns zero for zero occurrences", () => {
    const cost = calculatePatternCost({
      sessions_affected: 0,
      total_occurrences: 0,
      tokens_per_investigation: 1000,
    });

    expect(cost.total_tokens_wasted).toBe(0);
    expect(cost.estimated_cost_usd).toBe(0);
  });
});
