/**
 * Tests for pattern injection in get_errors and pattern_alert in get_project_health.
 *
 * @see src/mcp/server.ts handleGetErrors for injection
 * @see src/tools/get-project-health.ts for alert
 */

import { describe, it, expect } from "vitest";
import { createPatternAnalyzer } from "@/analysis/pattern-analyzer.js";
import { annotateWithPatterns } from "@/analysis/pattern-injector.js";
import type { RuntimeEvent } from "@/types/events.js";

/** Minimal event for testing. */
function makeEvent(fingerprint: string): RuntimeEvent {
  return {
    id: "test-id",
    timestamp: Date.now(),
    source: "server-stderr" as const,
    service: "main",
    level: "error",
    message: "test error",
    fingerprint,
    signal_score: 50,
    signal_strength: "high" as const,
    context: {},
    raw: "test",
    first_seen: Date.now(),
    occurrence_count: 1,
  };
}

describe("annotateWithPatterns", () => {
  it("adds patterns field to events with known patterns", () => {
    const analyzer = createPatternAnalyzer();
    analyzer.addSession({ session_id: "s1", timestamp: Date.now() - 3e6, fingerprints: ["fp-a"] });
    analyzer.addSession({ session_id: "s2", timestamp: Date.now() - 2e6, fingerprints: ["fp-a"] });
    analyzer.addSession({ session_id: "s3", timestamp: Date.now() - 1e6, fingerprints: ["fp-a"] });

    const events = [makeEvent("fp-a"), makeEvent("fp-b")];
    const annotated = annotateWithPatterns(events, analyzer);

    // fp-a should have patterns, fp-b should not
    expect(annotated[0].patterns).toBeDefined();
    expect(annotated[0].patterns!.recurring).toBeDefined();
    expect(annotated[0].patterns!.recurring!.sessions).toBe(3);
    expect(annotated[1].patterns).toBeUndefined();
  });

  it("returns events unchanged when no patterns exist", () => {
    const analyzer = createPatternAnalyzer();
    const events = [makeEvent("fp-x")];
    const annotated = annotateWithPatterns(events, analyzer);

    expect(annotated[0].patterns).toBeUndefined();
  });
});
