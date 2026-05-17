/**
 * Tests for signal aggregator snapshot metadata and frontend crash bridge.
 *
 * Covers:
 * - snapshot_timestamp is populated
 * - missing_signals correctly identifies unavailable layers
 * - active_layers reflects which layers contributed
 * - Frontend crash bridge events (service: "frontend") classified correctly
 * - Mixed backend + frontend events in same buffer
 */

import { describe, it, expect } from "vitest";
import { aggregateSignals } from "@/correlation/cross-layer/signal-aggregator.js";
import type { AggregatorDeps } from "@/correlation/cross-layer/types.js";
import { makeEvent } from "../../../helpers/make-event.js";

function makeDeps(overrides: Partial<AggregatorDeps> = {}): AggregatorDeps {
  return {
    getBackendEvents: () => [],
    getFrontendErrors: () => [],
    getGitChanges: async () => null,
    getLastHotReload: () => null,
    getLastRestart: () => null,
    cwd: "/tmp/test",
    ...overrides,
  };
}

describe("SignalSnapshot metadata", () => {
  it("snapshot_timestamp is a recent Unix ms value", async () => {
    const before = Date.now();
    const snapshot = await aggregateSignals(makeDeps(), Date.now() - 60_000);
    const after = Date.now();
    expect(snapshot.snapshot_timestamp).toBeGreaterThanOrEqual(before);
    expect(snapshot.snapshot_timestamp).toBeLessThanOrEqual(after);
  });

  it("missing_signals includes 'backend' when no backend events", async () => {
    const snapshot = await aggregateSignals(makeDeps(), Date.now() - 60_000);
    expect(snapshot.missing_signals).toContain("backend");
  });

  it("missing_signals includes 'frontend' when no frontend errors", async () => {
    const snapshot = await aggregateSignals(makeDeps(), Date.now() - 60_000);
    expect(snapshot.missing_signals).toContain("frontend");
  });

  it("missing_signals includes 'git' when git returns null", async () => {
    const snapshot = await aggregateSignals(makeDeps({ getGitChanges: async () => null }), Date.now() - 60_000);
    expect(snapshot.missing_signals).toContain("git");
  });

  it("missing_signals does NOT include 'git' when git returns empty array", async () => {
    const snapshot = await aggregateSignals(makeDeps({ getGitChanges: async () => [] }), Date.now() - 60_000);
    // Empty array means git is available but no changes — not "missing"
    expect(snapshot.missing_signals).not.toContain("git");
  });

  it("active_layers reflects which layers contributed signals", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getBackendEvents: () => [makeEvent({ timestamp: now - 1000, level: "error", context: { http_status: 500 } })],
      getGitChanges: async () => ["file.ts"],
      getLastHotReload: () => now - 5000,
    });
    const snapshot = await aggregateSignals(deps, now - 60_000);
    expect(snapshot.active_layers).toContain("backend");
    expect(snapshot.active_layers).toContain("git");
    expect(snapshot.active_layers).toContain("process");
  });

  it("active_layers is empty when no signals", async () => {
    const snapshot = await aggregateSignals(makeDeps(), Date.now() - 60_000);
    expect(snapshot.active_layers).toHaveLength(0);
  });
});

describe("Frontend crash bridge classification", () => {
  it("events with service='frontend' become frontend type-error signals", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getBackendEvents: () => [
        makeEvent({
          timestamp: now - 2000,
          level: "error",
          service: "frontend",
          message: "[Frontend] TypeError: Cannot read properties of null",
          context: { error_type: "TypeError" },
        }),
      ],
    });
    const snapshot = await aggregateSignals(deps, now - 60_000);
    expect(snapshot.signals).toHaveLength(1);
    expect(snapshot.signals[0].layer).toBe("frontend");
    expect(snapshot.signals[0].type).toBe("type-error");
  });

  it("frontend crash events include error_type in metadata", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getBackendEvents: () => [
        makeEvent({
          timestamp: now - 1000,
          service: "frontend",
          level: "error",
          message: "[Frontend] ReferenceError: x is not defined",
          context: { error_type: "ReferenceError", file: "src/App.tsx", line: 10 },
        }),
      ],
    });
    const snapshot = await aggregateSignals(deps, now - 60_000);
    expect(snapshot.signals[0].metadata).toHaveProperty("error_type", "ReferenceError");
    expect(snapshot.signals[0].metadata).toHaveProperty("file", "src/App.tsx");
    expect(snapshot.signals[0].metadata).toHaveProperty("line", 10);
  });

  it("mixed backend + frontend events are classified to correct layers", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getBackendEvents: () => [
        makeEvent({ timestamp: now - 3000, level: "info", service: "main", message: "GET /api 200", context: { http_status: 200 } }),
        makeEvent({ timestamp: now - 2000, level: "error", service: "frontend", message: "[Frontend] TypeError", context: { error_type: "TypeError" } }),
        makeEvent({ timestamp: now - 1000, level: "error", service: "main", message: "DB connection failed", context: {} }),
      ],
    });
    const snapshot = await aggregateSignals(deps, now - 60_000);
    const backendSignals = snapshot.signals.filter(s => s.layer === "backend");
    const frontendSignals = snapshot.signals.filter(s => s.layer === "frontend");
    expect(backendSignals.length).toBeGreaterThanOrEqual(2); // http-200 + exception
    expect(frontendSignals).toHaveLength(1); // type-error
  });

  it("frontend crash events strip [Frontend] prefix from error_message metadata", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getBackendEvents: () => [
        makeEvent({
          timestamp: now - 1000,
          service: "frontend",
          level: "error",
          message: "[Frontend] TypeError: foo is undefined",
          context: { error_type: "TypeError" },
        }),
      ],
    });
    const snapshot = await aggregateSignals(deps, now - 60_000);
    expect(snapshot.signals[0].metadata.error_message).toBe("TypeError: foo is undefined");
  });
});
