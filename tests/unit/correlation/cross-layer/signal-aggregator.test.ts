/**
 * Tests for the cross-layer signal aggregator.
 *
 * Verifies that signals are collected from all layers (backend, frontend,
 * git, process) and merged into a unified sorted LayerSignal array.
 */

import { describe, it, expect } from "vitest";
import { aggregateSignals } from "@/correlation/cross-layer/signal-aggregator.js";
import type { AggregatorDeps, LayerSignal } from "@/correlation/cross-layer/types.js";
import { makeEvent } from "../../../helpers/make-event.js";

/** Create mock AggregatorDeps with configurable returns. */
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

describe("aggregateSignals", () => {
  it("returns empty array when no signals from any layer", async () => {
    const deps = makeDeps();
    const signals = await aggregateSignals(deps, Date.now() - 60_000);
    expect(signals).toEqual([]);
  });

  it("collects backend error signals from ring buffer events", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getBackendEvents: () => [
        makeEvent({ timestamp: now - 5000, level: "error", message: "TypeError: x is undefined", context: { http_status: 500 } }),
      ],
    });
    const signals = await aggregateSignals(deps, now - 60_000);
    expect(signals).toHaveLength(1);
    expect(signals[0].layer).toBe("backend");
    expect(signals[0].type).toBe("http-500");
    expect(signals[0].timestamp).toBe(now - 5000);
  });

  it("maps backend 200 OK events as http-200 type", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getBackendEvents: () => [
        makeEvent({ timestamp: now - 3000, level: "info", message: "GET /api/users 200", context: { http_status: 200 } }),
      ],
    });
    const signals = await aggregateSignals(deps, now - 60_000);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("http-200");
  });

  it("maps backend errors without http_status as exception type", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getBackendEvents: () => [
        makeEvent({ timestamp: now - 2000, level: "error", message: "ReferenceError: foo is not defined" }),
      ],
    });
    const signals = await aggregateSignals(deps, now - 60_000);
    expect(signals[0].type).toBe("exception");
  });

  it("collects frontend error signals", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getFrontendErrors: () => [
        {
          id: "fe-1",
          timestamp: now - 4000,
          url: "http://localhost:3000/api/users",
          path: "/api/users",
          method: "GET",
          statusCode: 500,
          statusText: "Internal Server Error",
          responseHeaders: {},
          source: "cdp" as const,
        },
      ],
    });
    const signals = await aggregateSignals(deps, now - 60_000);
    expect(signals).toHaveLength(1);
    expect(signals[0].layer).toBe("frontend");
    expect(signals[0].type).toBe("http-failure");
  });

  it("collects git file-changed signals", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getGitChanges: async () => ["src/app.ts", "src/utils.ts"],
      // Provide recent reload so no-restart-detected doesn't fire
      getLastHotReload: () => now - 5000,
    });
    const signals = await aggregateSignals(deps, now - 60_000);
    const gitSignals = signals.filter((s) => s.layer === "git");
    expect(gitSignals).toHaveLength(1);
    expect(gitSignals[0].type).toBe("file-changed");
    expect(gitSignals[0].metadata).toHaveProperty("files");
  });

  it("collects process no-restart signal when file changed but no reload", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getGitChanges: async () => ["src/app.ts"],
      getLastHotReload: () => now - 120_000, // 2 min ago (stale)
      getLastRestart: () => now - 120_000,
    });
    const signals = await aggregateSignals(deps, now - 60_000);
    // Should have git signal + process signal
    const processSignals = signals.filter((s) => s.layer === "process");
    expect(processSignals.length).toBeGreaterThanOrEqual(1);
    expect(processSignals[0].type).toBe("no-restart-detected");
  });

  it("collects process hot-reload signal when recent reload detected", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getLastHotReload: () => now - 5000, // 5s ago
    });
    const signals = await aggregateSignals(deps, now - 60_000);
    const processSignals = signals.filter((s) => s.layer === "process");
    expect(processSignals).toHaveLength(1);
    expect(processSignals[0].type).toBe("hot-reload");
  });

  it("merges all layers sorted by timestamp ascending", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getBackendEvents: () => [
        makeEvent({ timestamp: now - 3000, level: "error", message: "Error", context: { http_status: 500 } }),
      ],
      getFrontendErrors: () => [
        {
          id: "fe-1",
          timestamp: now - 1000,
          url: "http://localhost:3000/api",
          path: "/api",
          method: "GET",
          statusCode: 500,
          statusText: "Error",
          responseHeaders: {},
          source: "cdp" as const,
        },
      ],
      getGitChanges: async () => ["src/app.ts"],
    });
    const signals = await aggregateSignals(deps, now - 60_000);
    expect(signals.length).toBeGreaterThanOrEqual(2);
    // Verify sorted ascending
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i].timestamp).toBeGreaterThanOrEqual(signals[i - 1].timestamp);
    }
  });

  it("handles git unavailable gracefully (returns null)", async () => {
    const deps = makeDeps({
      getGitChanges: async () => null,
    });
    const signals = await aggregateSignals(deps, Date.now() - 60_000);
    const gitSignals = signals.filter((s) => s.layer === "git");
    expect(gitSignals).toHaveLength(0);
  });

  it("maps repeated errors (occurrence_count >= 3) as repeated-error type", async () => {
    const now = Date.now();
    const deps = makeDeps({
      getBackendEvents: () => [
        makeEvent({ timestamp: now - 2000, level: "error", message: "Connection refused", occurrence_count: 5, fingerprint: "fp-conn" }),
      ],
    });
    const signals = await aggregateSignals(deps, now - 60_000);
    const repeated = signals.filter((s) => s.type === "repeated-error");
    expect(repeated).toHaveLength(1);
    expect(repeated[0].metadata).toHaveProperty("occurrence_count", 5);
  });
});
