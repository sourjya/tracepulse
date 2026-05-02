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
    expect(cost.energy_wh).toBeGreaterThan(0);
    expect(cost.co2_g).toBeGreaterThan(0);
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
