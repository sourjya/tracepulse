/**
 * End-to-end integration test for the M27 lifecycle system.
 *
 * Tests the full flow: error arrives → agent queries → file change →
 * timer → suppressed → re-exercise → resolved.
 *
 * Exercises all components working together: FSM, hooks, journal bridge,
 * metrics computation.
 *
 * @see .kiro/specs/m27-event-journal/design.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createLifecycleFSM } from "@/store/lifecycle-fsm.js";
import { createLifecycleHooks } from "@/store/lifecycle-hooks.js";
import { createJournalBridge } from "@/persistence/journal-bridge.js";
import { computeLifecycleMetrics } from "@/store/lifecycle-metrics.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `tp-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    source: "server-stderr",
    service: "main",
    level: "error",
    message: "Test error",
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    signal_score: 50,
    signal_strength: "high",
    context: { file: "src/app.ts", line: 42, error_type: "TypeError" },
    raw: "raw line",
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

describe("M27 lifecycle E2E", () => {
  let tempDir: string;
  let buffer: ReturnType<typeof createRingBuffer>;
  let fsm: ReturnType<typeof createLifecycleFSM>;
  let hooks: ReturnType<typeof createLifecycleHooks>;

  beforeEach(() => {
    vi.useFakeTimers();
    tempDir = makeTempDir();
    buffer = createRingBuffer(100);
    fsm = createLifecycleFSM();
    hooks = createLifecycleHooks(fsm);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("full happy path: error → surfaced → investigated → edit_observed → suppressed → resolved", () => {
    const journalPath = join(tempDir, "events.jsonl");
    const telemetryPath = join(tempDir, "telemetry.json");
    const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });

    // 1. Error arrives
    const event = makeEvent({ fingerprint: "fp-bug-123" });
    buffer.push(event);

    // 2. Agent calls get_errors → surfaces the error
    hooks.onCommandRun("npx vitest run", ["fp-bug-123"]);
    hooks.onErrorsSurfaced(["fp-bug-123"]);
    expect(fsm.getState("fp-bug-123")).toBe("surfaced");

    // 3. Agent investigates
    hooks.onErrorInvestigated("fp-bug-123");
    expect(fsm.getState("fp-bug-123")).toBe("investigated");

    // 4. Agent edits code, HMR fires
    hooks.onFileChanged();
    expect(fsm.getState("fp-bug-123")).toBe("edit_observed");
    expect(fsm.getActiveTimerCount()).toBe(1);

    // 5. Timer fires → suppressed
    vi.advanceTimersByTime(30_000);
    expect(fsm.getState("fp-bug-123")).toBe("suppressed");
    expect(fsm.getActiveTimerCount()).toBe(0);

    // 6. Agent re-runs the same command, error absent → resolved
    hooks.onCommandRun("npx vitest run", []);
    expect(fsm.getState("fp-bug-123")).toBe("resolved");

    // 7. Metrics reflect the resolution
    const metrics = computeLifecycleMetrics(fsm);
    expect(metrics.total_episodes).toBe(1);
    expect(metrics.confirmed_fix_rate).toBe(1.0);
    expect(metrics.recurrence_rate).toBe(0);

    // 8. Journal has the error entry
    const content = readFileSync(journalPath, "utf-8");
    expect(content).toContain("fp-bug-123");

    bridge.shutdown();
  });

  it("recurrence path: error → surfaced → investigated → edit_observed → recurred → surfaced again", () => {
    hooks.onErrorsSurfaced(["fp-flaky"]);
    hooks.onErrorInvestigated("fp-flaky");
    hooks.onFileChanged();

    // Error comes back before timer fires
    hooks.onErrorRecurred("fp-flaky");
    expect(fsm.getState("fp-flaky")).toBe("recurred");

    // Timer should have been cancelled
    vi.advanceTimersByTime(30_000);
    expect(fsm.getState("fp-flaky")).toBe("recurred"); // not suppressed

    // Agent resurfaces the error (new cycle)
    hooks.onErrorsSurfaced(["fp-flaky"]);
    expect(fsm.getState("fp-flaky")).toBe("surfaced");

    // Metrics: 1 episode with outcome=recurred
    const metrics = computeLifecycleMetrics(fsm);
    expect(metrics.total_episodes).toBe(1);
    expect(metrics.recurrence_rate).toBe(1.0);
  });

  it("multiple errors tracked independently in the same session", () => {
    hooks.onCommandRun("pytest tests/", ["fp-auth", "fp-db", "fp-ui"]);
    hooks.onErrorsSurfaced(["fp-auth", "fp-db", "fp-ui"]);

    // Investigate all three
    hooks.onErrorInvestigated("fp-auth");
    hooks.onErrorInvestigated("fp-db");
    hooks.onErrorInvestigated("fp-ui");

    // File change affects all investigated fps
    hooks.onFileChanged();
    expect(fsm.getState("fp-auth")).toBe("edit_observed");
    expect(fsm.getState("fp-db")).toBe("edit_observed");
    expect(fsm.getState("fp-ui")).toBe("edit_observed");

    // Timer fires for all
    vi.advanceTimersByTime(30_000);

    // Re-run: fp-auth fixed, fp-db still broken, fp-ui fixed
    hooks.onCommandRun("pytest tests/", ["fp-db"]);

    expect(fsm.getState("fp-auth")).toBe("resolved");
    expect(fsm.getState("fp-db")).toBe("recurred");
    expect(fsm.getState("fp-ui")).toBe("resolved");

    const metrics = computeLifecycleMetrics(fsm);
    expect(metrics.total_episodes).toBe(3);
    expect(metrics.resolved_count).toBe(2);
    expect(metrics.recurred_count).toBe(1);
  });

  it("journal survives crash (no shutdown) and compacts on next startup", () => {
    const journalPath = join(tempDir, "events.jsonl");
    const telemetryPath = join(tempDir, "telemetry.json");

    // Session 1: write events, then "crash" (no shutdown)
    const bridge1 = createJournalBridge({ journalPath, telemetryPath, buffer });
    buffer.push(makeEvent({ fingerprint: "fp-crash-victim" }));
    // NO bridge1.shutdown() — simulating crash

    // Verify journal has the event
    const content1 = readFileSync(journalPath, "utf-8");
    expect(content1).toContain("fp-crash-victim");

    // Session 2: compacts session 1 data on startup
    const buffer2 = createRingBuffer(100);
    const bridge2 = createJournalBridge({ journalPath, telemetryPath, buffer: buffer2 });

    // telemetry.json should have session 1 data
    expect(existsSync(telemetryPath)).toBe(true);
    const telemetry = JSON.parse(readFileSync(telemetryPath, "utf-8"));
    expect(telemetry.sessions.length).toBeGreaterThanOrEqual(1);
    expect(telemetry.fingerprints["fp-crash-victim"]).toBeDefined();

    bridge2.shutdown();
  });

  it("episode tracks tool call count correctly across full lifecycle", () => {
    hooks.onErrorsSurfaced(["fp-deep"]);
    hooks.onErrorInvestigated("fp-deep"); // tool call 1
    hooks.onErrorInvestigated("fp-deep"); // tool call 2 (get_prompt_context)
    hooks.onErrorInvestigated("fp-deep"); // tool call 3

    hooks.onFileChanged();
    vi.advanceTimersByTime(30_000); // → suppressed

    const episode = fsm.getEpisode("fp-deep");
    expect(episode!.tool_calls).toBe(3);
    expect(episode!.outcome).toBe("suppressed");
  });
});
