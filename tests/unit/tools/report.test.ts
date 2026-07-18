/**
 * Tests for `tracepulse report` model + renderers.
 *
 * @see src/tools/report.ts
 * @see TRP-86
 */

import { describe, it, expect } from "vitest";
import { buildReportModel, sparkline, renderReportText, renderReportHtml } from "@/tools/report.js";
import type { TelemetrySummary } from "@/persistence/event-journal.js";

function telemetry(overrides: Partial<TelemetrySummary> = {}): TelemetrySummary {
  return {
    version: 1,
    compacted_at: 0,
    sessions: [
      { sid: "s2", started_at: 2000, error_count: 5, unique_fingerprints: 3 },
      { sid: "s1", started_at: 1000, error_count: 2, unique_fingerprints: 2 },
    ],
    fingerprints: {
      fpA: { total_occurrences: 9, first_seen: 1, last_seen: 2, last_state: "recurred" },
      fpB: { total_occurrences: 3, first_seen: 1, last_seen: 2 },
    },
    ...overrides,
  };
}

describe("sparkline", () => {
  it("returns empty string for no values", () => {
    expect(sparkline([])).toBe("");
  });
  it("maps values to 8 block levels, max → full block", () => {
    expect(sparkline([0, 8])).toBe("▁█");
  });
  it("renders all-lowest when every value is zero", () => {
    expect(sparkline([0, 0, 0])).toBe("▁▁▁");
  });
});

describe("buildReportModel", () => {
  it("sorts sessions oldest-first and totals correctly", () => {
    const m = buildReportModel(telemetry());
    expect(m.sessions.map((s) => s.error_count)).toEqual([2, 5]); // sorted by started_at
    expect(m.totals).toEqual({ sessions: 2, errors: 7, unique_fingerprints: 2 });
  });
  it("ranks top fingerprints by total_occurrences", () => {
    const m = buildReportModel(telemetry());
    expect(m.top_fingerprints[0].fp).toBe("fpA");
    expect(m.top_fingerprints[0].total_occurrences).toBe(9);
  });
});

describe("renderReportText", () => {
  it("includes totals, a sparkline, and the provenance footer", () => {
    const text = renderReportText(buildReportModel(telemetry()));
    expect(text).toContain("Sessions: 2");
    expect(text).toContain("Errors per session:");
    expect(text).toMatch(/get_effectiveness_report/);
  });
});

describe("renderReportHtml", () => {
  it("is a self-contained document with no external references", () => {
    const html = renderReportHtml(buildReportModel(telemetry()));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<svg");
    expect(html).toContain("prefers-color-scheme"); // theme-aware
    // No external network references (self-contained per the report's design).
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script/i);
  });
  it("escapes fingerprint text into the SVG", () => {
    const html = renderReportHtml(buildReportModel(telemetry({
      fingerprints: { "<x>": { total_occurrences: 1, first_seen: 0, last_seen: 0 } },
    })));
    expect(html).toContain("&lt;x&gt;");
    expect(html).not.toContain("<x>");
  });
  it("shows an empty state when there are no sessions", () => {
    const html = renderReportHtml(buildReportModel(telemetry({ sessions: [], fingerprints: {} })));
    expect(html).toContain("No sessions recorded yet.");
  });
});
