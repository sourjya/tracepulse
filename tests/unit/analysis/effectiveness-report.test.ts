/**
 * Tests for the effectiveness report (measured lifecycle outcomes + Wilson CIs).
 *
 * @see src/analysis/effectiveness-report.ts
 * @see TRP-84
 */

import { describe, it, expect } from "vitest";
import { wilsonInterval, computeEffectivenessReport } from "@/analysis/effectiveness-report.js";
import type { LifecycleMetrics } from "@/store/lifecycle-metrics.js";

function metrics(overrides: Partial<LifecycleMetrics> = {}): LifecycleMetrics {
  return {
    total_episodes: 0,
    suppressed_count: 0,
    resolved_count: 0,
    recurred_count: 0,
    suppressed_rate: 0,
    confirmed_fix_rate: 0,
    recurrence_rate: 0,
    mean_time_to_fix: 0,
    ...overrides,
  };
}

describe("wilsonInterval", () => {
  it("returns {0,0} for n=0", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
  });

  it("keeps bounds within [0,1] and brackets the point estimate", () => {
    const { low, high } = wilsonInterval(8, 10); // p=0.8
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(1);
    expect(low).toBeLessThan(0.8);
    expect(high).toBeGreaterThan(0.8);
  });

  it("is wider at small n than large n for the same proportion", () => {
    const small = wilsonInterval(4, 5);   // 0.8, n=5
    const large = wilsonInterval(80, 100); // 0.8, n=100
    expect(high(small) - low(small)).toBeGreaterThan(high(large) - low(large));
  });
});

function low(x: { low: number }) { return x.low; }
function high(x: { high: number }) { return x.high; }

describe("computeEffectivenessReport", () => {
  it("reports zeros with empty CIs and n=0 for no episodes", () => {
    const r = computeEffectivenessReport(metrics(), { version: "9.9.9", tpResponseTokensTotal: 0 });
    expect(r.total_episodes).toBe(0);
    expect(r.confirmed_fix_rate).toEqual({ value: 0, n: 0, ci_low: 0, ci_high: 0 });
    expect(r.tp_version).toBe("9.9.9");
    expect(r.provenance).toContain("measured");
  });

  it("computes rates with n and CIs from lifecycle counts", () => {
    const r = computeEffectivenessReport(
      metrics({ total_episodes: 10, resolved_count: 6, recurred_count: 1, suppressed_count: 3, mean_time_to_fix: 4200 }),
      { version: "1.0.0", tpResponseTokensTotal: 12345 },
    );
    expect(r.total_episodes).toBe(10);
    expect(r.confirmed_fix_rate.value).toBe(0.6);
    expect(r.confirmed_fix_rate.n).toBe(10);
    expect(r.confirmed_fix_rate.ci_low).toBeGreaterThan(0);
    expect(r.confirmed_fix_rate.ci_high).toBeLessThan(1);
    expect(r.recurrence_rate.value).toBe(0.1);
    expect(r.suppressed_rate.value).toBe(0.3);
    expect(r.mean_time_to_fix_ms).toBe(4200);
    expect(r.counts).toEqual({ suppressed: 3, resolved: 6, recurred: 1 });
    expect(r.tp_response_tokens_total).toBe(12345);
  });
});
