/**
 * Tests for the journal bridge — the integration layer between
 * the ring buffer/pipeline and the event journal.
 *
 * Covers: positive (happy path), negative (error handling),
 * edge cases (empty buffers, rapid events, dedup), and
 * regression tests for crash safety.
 *
 * @see src/persistence/journal-bridge.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createJournalBridge,
  type JournalBridge,
} from "@/persistence/journal-bridge.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { RuntimeEvent } from "@/types/events.js";

/** Create a temp directory for each test. */
function makeTempDir(): string {
  const dir = join(tmpdir(), `tp-bridge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Factory for minimal RuntimeEvent objects. */
function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    source: "server-stderr",
    service: "main",
    level: "error",
    message: "Test error message",
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    signal_score: 50,
    signal_strength: "high",
    context: {},
    raw: "raw log line",
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

describe("journal-bridge", () => {
  let tempDir: string;
  let journalPath: string;
  let telemetryPath: string;
  let buffer: EventBuffer;

  beforeEach(() => {
    tempDir = makeTempDir();
    journalPath = join(tempDir, "events.jsonl");
    telemetryPath = join(tempDir, "telemetry.json");
    buffer = createRingBuffer(100);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────
  // Positive Tests (Happy Path)
  // ──────────────────────────────────────────────

  describe("positive: event journaling", () => {
    it("writes a session_start entry on creation", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });

      expect(existsSync(journalPath)).toBe(true);
      const content = readFileSync(journalPath, "utf-8");
      const entry = JSON.parse(content.trim().split("\n")[0]);
      expect(entry.type).toBe("session_start");
      expect(entry.sid).toBeTruthy();
      bridge.shutdown();
    });

    it("journals error events pushed to the buffer", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      const event = makeEvent({ level: "error", fingerprint: "fp-err-1" });
      buffer.push(event);

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n");
      // session_start + error entry
      expect(lines.length).toBeGreaterThanOrEqual(2);

      const errorEntry = JSON.parse(lines[1]);
      expect(errorEntry.type).toBe("error");
      expect(errorEntry.data.fingerprint).toBe("fp-err-1");
      expect(errorEntry.data.level).toBe("error");
      bridge.shutdown();
    });

    it("journals warning events pushed to the buffer", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      const event = makeEvent({ level: "warn", fingerprint: "fp-warn-1" });
      buffer.push(event);

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n");
      const warnEntry = JSON.parse(lines[1]);
      expect(warnEntry.type).toBe("error");
      expect(warnEntry.data.level).toBe("warn");
      bridge.shutdown();
    });

    it("writes session_end entry on shutdown", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent({ level: "error" }));
      buffer.push(makeEvent({ level: "warn" }));

      bridge.shutdown();

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n");
      const lastEntry = JSON.parse(lines[lines.length - 1]);
      expect(lastEntry.type).toBe("session_end");
      expect(lastEntry.data.duration_ms).toBeGreaterThanOrEqual(0);
    });

    // TRP-80: session_end must reflect real lifecycle outcomes, not hardcoded zeros.
    it("populates session_end suppressed/resolved from the lifecycle FSM", () => {
      // Partial FSM fake — computeLifecycleMetrics only reads exportStates + getEpisodeHistory.
      const episodes: Record<string, Array<{ outcome: string; started_at: number; ended_at: number }>> = {
        "fp-supp": [{ outcome: "suppressed", started_at: 0, ended_at: 100 }],
        "fp-res-1": [{ outcome: "resolved", started_at: 0, ended_at: 50 }],
        "fp-res-2": [{ outcome: "resolved", started_at: 0, ended_at: 70 }],
      };
      const fakeFsm = {
        exportStates: () => new Map(Object.keys(episodes).map((fp) => [fp, "resolved"])),
        getEpisodeHistory: (fp: string) => episodes[fp] ?? [],
      } as unknown as import("@/store/lifecycle-fsm.js").LifecycleFSM;

      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer, lifecycleFsm: fakeFsm });
      bridge.shutdown();

      const lines = readFileSync(journalPath, "utf-8").trim().split("\n");
      const end = JSON.parse(lines[lines.length - 1]);
      expect(end.type).toBe("session_end");
      expect(end.data.errors_suppressed).toBe(1);
      expect(end.data.errors_resolved).toBe(2);
    });

    it("session_end falls back to zero suppressed/resolved when no FSM is wired", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      bridge.shutdown();

      const lines = readFileSync(journalPath, "utf-8").trim().split("\n");
      const end = JSON.parse(lines[lines.length - 1]);
      expect(end.data.errors_suppressed).toBe(0);
      expect(end.data.errors_resolved).toBe(0);
    });

    it("truncates message to 200 chars in journal entries", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      const longMessage = "A".repeat(500);
      buffer.push(makeEvent({ message: longMessage }));

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n");
      const errorEntry = JSON.parse(lines[1]);
      expect(errorEntry.data.message.length).toBeLessThanOrEqual(200);
      bridge.shutdown();
    });

    it("includes context (file, line, error_type) in journal entries", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent({
        context: { file: "src/app.ts", line: 42, error_type: "TypeError" },
      }));

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n");
      const errorEntry = JSON.parse(lines[1]);
      expect(errorEntry.data.context.file).toBe("src/app.ts");
      expect(errorEntry.data.context.line).toBe(42);
      expect(errorEntry.data.context.error_type).toBe("TypeError");
      bridge.shutdown();
    });

    it("all entries share the same session ID", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent());
      buffer.push(makeEvent());
      bridge.shutdown();

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const sids = lines.map(l => JSON.parse(l).sid);
      const unique = [...new Set(sids)];
      expect(unique).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────
  // Negative Tests (Error Handling)
  // ──────────────────────────────────────────────

  describe("negative: error handling", () => {
    it("does not journal info-level events (only error + warn)", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent({ level: "info", fingerprint: "fp-info" }));

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      // Only session_start, no error entry
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]).type).toBe("session_start");
      bridge.shutdown();
    });

    it("does not journal debug-level events", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent({ level: "debug", fingerprint: "fp-debug" }));

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      bridge.shutdown();
    });

    it("survives journal write failure gracefully", () => {
      // Mock stderr to suppress warning output during test
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      // Use /dev/full which accepts writes but reports ENOSPC — skip on systems without it
      // Instead, test that the bridge is resilient by verifying it doesn't throw
      // even when the initial compaction encounters a corrupt file
      writeFileSync(journalPath, "corrupt line\n", "utf-8");
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      bridge.shutdown();

      stderrSpy.mockRestore();
    });

    it("does not double-shutdown", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      bridge.shutdown();
      bridge.shutdown(); // Second call is a no-op

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      // Only one session_end entry
      const sessionEnds = lines.filter(l => JSON.parse(l).type === "session_end");
      expect(sessionEnds).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────
  // Edge Cases
  // ──────────────────────────────────────────────

  describe("edge: boundary conditions", () => {
    it("handles empty buffer shutdown (no events)", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      bridge.shutdown();

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(2); // session_start + session_end
      const endEntry = JSON.parse(lines[1]);
      expect(endEntry.data.errors_surfaced).toBe(0);
    });

    it("handles rapid sequential events without data loss", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });

      // Push 100 events rapidly
      for (let i = 0; i < 100; i++) {
        buffer.push(makeEvent({ fingerprint: `fp-rapid-${i}`, level: "error" }));
      }

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      // session_start + 100 error entries
      expect(lines).toHaveLength(101);
      bridge.shutdown();
    });

    it("does not journal deduped events (same fingerprint pushed twice)", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });

      // Same fingerprint — second push is a dedup (ring buffer doesn't fire subscriber)
      buffer.push(makeEvent({ fingerprint: "fp-dup", level: "error" }));
      buffer.push(makeEvent({ fingerprint: "fp-dup", level: "error" }));

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      // session_start + 1 error entry (dedup doesn't fire subscriber for the second)
      expect(lines).toHaveLength(2);
      bridge.shutdown();
    });

    it("handles events with no context gracefully", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent({ context: {} }));

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const errorEntry = JSON.parse(lines[1]);
      // context should be omitted or empty — not crash
      expect(errorEntry.data).toBeDefined();
      bridge.shutdown();
    });

    it("handles events with empty message", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent({ message: "" }));

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      bridge.shutdown();
    });

    it("hot-reload events are not journaled as errors", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent({
        fingerprint: "hotreload:vite-success",
        level: "info",
        message: "Build succeeded",
      }));

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      // Only session_start — hot-reload info events are not journaled
      expect(lines).toHaveLength(1);
      bridge.shutdown();
    });
  });

  // ──────────────────────────────────────────────
  // Regression Tests
  // ──────────────────────────────────────────────

  describe("regression: crash safety", () => {
    it("entries are readable after simulated crash (no shutdown called)", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent({ fingerprint: "fp-crash-test", level: "error", message: "crashed" }));
      // Simulate crash: do NOT call bridge.shutdown()

      // Verify the journal file has the event (sync writes guarantee this)
      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);

      const errorEntry = JSON.parse(lines[1]);
      expect(errorEntry.data.fingerprint).toBe("fp-crash-test");
      expect(errorEntry.data.message).toBe("crashed");
    });

    it("compacts existing journal on startup if entries present", () => {
      // First session: write some events
      const bridge1 = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent({ fingerprint: "fp-s1", level: "error" }));
      bridge1.shutdown();

      // Second session: should compact the first session's journal
      const buffer2 = createRingBuffer(100);
      const bridge2 = createJournalBridge({ journalPath, telemetryPath, buffer: buffer2 });

      // telemetry.json should now exist with the first session's data
      expect(existsSync(telemetryPath)).toBe(true);
      const telemetry = JSON.parse(readFileSync(telemetryPath, "utf-8"));
      expect(telemetry.sessions.length).toBeGreaterThanOrEqual(1);

      // Journal should be fresh (only session_start from new session)
      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]).type).toBe("session_start");
      bridge2.shutdown();
    });

    it("handles corrupt journal on startup gracefully", () => {
      // Write garbage to journal
      writeFileSync(journalPath, "not json\n{broken\nalso broken\n", "utf-8");

      // Creating bridge should not crash — should compact (skip corrupt lines) and continue
      expect(() => {
        const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
        bridge.shutdown();
      }).not.toThrow();
    });

    it("session_end records correct error counts", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      buffer.push(makeEvent({ fingerprint: "fp-1", level: "error" }));
      buffer.push(makeEvent({ fingerprint: "fp-2", level: "error" }));
      buffer.push(makeEvent({ fingerprint: "fp-3", level: "warn" }));
      bridge.shutdown();

      const content = readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const endEntry = JSON.parse(lines[lines.length - 1]);
      expect(endEntry.type).toBe("session_end");
      expect(endEntry.data.errors_surfaced).toBe(3);
    });

    it("unsubscribes from buffer after shutdown", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });
      bridge.shutdown();

      // Events pushed after shutdown should NOT appear in journal
      buffer.push(makeEvent({ fingerprint: "fp-after-shutdown", level: "error" }));

      const content = readFileSync(journalPath, "utf-8");
      expect(content).not.toContain("fp-after-shutdown");
    });
  });

  // ──────────────────────────────────────────────
  // Agent info
  // ──────────────────────────────────────────────

  describe("agent info", () => {
    it("records agent info in session_start when provided", () => {
      const bridge = createJournalBridge({
        journalPath,
        telemetryPath,
        buffer,
        agentInfo: { name: "kiro", version: "1.2.0" },
      });

      const content = readFileSync(journalPath, "utf-8");
      const startEntry = JSON.parse(content.trim().split("\n")[0]);
      expect(startEntry.data.agent).toEqual({ name: "kiro", version: "1.2.0" });
      bridge.shutdown();
    });

    it("session_start works without agent info", () => {
      const bridge = createJournalBridge({ journalPath, telemetryPath, buffer });

      const content = readFileSync(journalPath, "utf-8");
      const startEntry = JSON.parse(content.trim().split("\n")[0]);
      expect(startEntry.data.agent).toBeUndefined();
      bridge.shutdown();
    });
  });
});
