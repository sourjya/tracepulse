/**
 * Tests for run_and_watch usage nudge in get_session_insights.
 *
 * Detects when the agent has been active (many tool calls) but never
 * used run_and_watch, and suggests it.
 *
 * @see src/tools/get-session-insights.ts for implementation
 */

import { describe, it, expect } from "vitest";
import { detectRunAndWatchGap } from "@/analysis/usage-nudge.js";
import type { AuditRecord } from "@/store/audit-buffer.js";

function entry(tool: string, timestamp = Date.now()): AuditRecord {
  return { tool, timestamp, params: {}, response_tokens: 100, duration_ms: 50 };
}

describe("detectRunAndWatchGap", () => {
  it("returns nudge when many calls but no run_and_watch", () => {
    const entries: AuditEntry[] = [
      entry("get_errors"), entry("get_errors"), entry("get_errors"),
      entry("get_build_errors"), entry("verify_fix"),
      entry("get_error_context"), entry("get_errors"),
      entry("get_errors"), entry("get_project_health"),
      entry("get_errors"),
    ];
    const nudge = detectRunAndWatchGap(entries);
    expect(nudge).not.toBeNull();
    expect(nudge!).toContain("run_and_watch");
  });

  it("returns null when run_and_watch has been used", () => {
    const entries: AuditEntry[] = [
      entry("get_errors"), entry("run_and_watch"), entry("get_errors"),
    ];
    const nudge = detectRunAndWatchGap(entries);
    expect(nudge).toBeNull();
  });

  it("returns null when too few calls to judge", () => {
    const entries: AuditEntry[] = [
      entry("get_errors"), entry("get_project_health"),
    ];
    const nudge = detectRunAndWatchGap(entries);
    expect(nudge).toBeNull();
  });

  it("returns null when verify_build was used (also runs commands)", () => {
    const entries: AuditEntry[] = Array.from({ length: 10 }, () => entry("get_errors"));
    entries.push(entry("verify_build"));
    const nudge = detectRunAndWatchGap(entries);
    expect(nudge).toBeNull();
  });
});
