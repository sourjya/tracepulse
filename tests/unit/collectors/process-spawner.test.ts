/**
 * Unit tests for the process spawner collector.
 *
 * Tests use real child processes with simple commands (echo, node -e, printf)
 * to verify stdout/stderr capture, line splitting, exit detection, and
 * graceful shutdown. Every test cleans up its spawned process via stop().
 *
 * @see src/collectors/process-spawner.ts for implementation
 * @see src/types/collectors.ts for the Collector interface
 */

import { describe, it, expect, afterEach } from "vitest";
import type { EventSource } from "@/constants/events";
import type { Collector } from "@/types/collectors";
import { createProcessSpawner } from "@/collectors/process-spawner";

/** Collected line with its source tag. */
interface CapturedLine {
  readonly source: EventSource;
  readonly line: string;
}

describe("createProcessSpawner", () => {
  /** Track the active collector so afterEach can clean up. */
  let collector: Collector | undefined;

  afterEach(async () => {
    if (collector) {
      await collector.stop();
      collector = undefined;
    }
  });

  /**
   * Helper: start a collector and accumulate lines into an array.
   * Returns the array reference so the caller can inspect captured lines.
   */
  function startCollecting(command: string): {
    lines: CapturedLine[];
    started: Promise<void>;
  } {
    const lines: CapturedLine[] = [];
    collector = createProcessSpawner(command);
    const started = collector.start((source, line) => {
      lines.push({ source, line });
    });
    return { lines, started };
  }

  // ──────────────────────────────────────────────
  // stdout capture
  // ──────────────────────────────────────────────

  it("captures stdout from 'echo hello'", async () => {
    const { lines, started } = startCollecting("echo hello");
    await started;

    // Wait for the process to exit and lines to flush
    await new Promise((r) => setTimeout(r, 300));

    expect(lines.some((l) => l.line === "hello")).toBe(true);
  });

  it("tags stdout lines with source 'server-stdout'", async () => {
    const { lines, started } = startCollecting("echo stdout-test");
    await started;

    await new Promise((r) => setTimeout(r, 300));

    const stdoutLines = lines.filter((l) => l.source === "server-stdout");
    expect(stdoutLines.some((l) => l.line === "stdout-test")).toBe(true);
  });

  // ──────────────────────────────────────────────
  // stderr capture
  // ──────────────────────────────────────────────

  it("captures stderr with source 'server-stderr'", async () => {
    const { lines, started } = startCollecting(
      'node -e "process.stderr.write(\'err-msg\\n\')"',
    );
    await started;

    await new Promise((r) => setTimeout(r, 300));

    const stderrLines = lines.filter((l) => l.source === "server-stderr");
    expect(stderrLines.some((l) => l.line === "err-msg")).toBe(true);
  });

  // ──────────────────────────────────────────────
  // Line splitting
  // ──────────────────────────────────────────────

  it("splits multiple lines from a single command", async () => {
    const { lines, started } = startCollecting(
      'printf "line1\\nline2\\nline3\\n"',
    );
    await started;

    await new Promise((r) => setTimeout(r, 300));

    const stdoutTexts = lines
      .filter((l) => l.source === "server-stdout")
      .map((l) => l.line);
    expect(stdoutTexts).toContain("line1");
    expect(stdoutTexts).toContain("line2");
    expect(stdoutTexts).toContain("line3");
  });

  // ──────────────────────────────────────────────
  // Exit detection
  // ──────────────────────────────────────────────

  it("detects clean child exit and emits synthetic exit event", async () => {
    const { lines, started } = startCollecting("echo done");
    await started;

    await new Promise((r) => setTimeout(r, 300));

    const exitLine = lines.find((l) =>
      l.line.includes("[tracepulse] Process exited with code"),
    );
    expect(exitLine).toBeDefined();
    expect(exitLine!.source).toBe("server-stderr");
    expect(exitLine!.line).toContain("code 0");
  });

  // ──────────────────────────────────────────────
  // isConnected()
  // ──────────────────────────────────────────────

  it("returns true while running, false after exit", { timeout: 10_000 }, async () => {
    collector = createProcessSpawner(
      'node -e "setTimeout(() => {}, 10000)"',
    );
    const lines: CapturedLine[] = [];
    await collector.start((source, line) => {
      lines.push({ source, line });
    });

    expect(collector.isConnected()).toBe(true);

    await collector.stop();
    expect(collector.isConnected()).toBe(false);

    // Prevent afterEach from calling stop() again
    collector = undefined;
  });

  // ──────────────────────────────────────────────
  // stop() / graceful shutdown
  // ──────────────────────────────────────────────

  it("stop() sends SIGTERM and resolves after child exits", { timeout: 10_000 }, async () => {
    collector = createProcessSpawner(
      'node -e "setTimeout(() => {}, 10000)"',
    );
    const lines: CapturedLine[] = [];
    await collector.start((source, line) => {
      lines.push({ source, line });
    });

    expect(collector.isConnected()).toBe(true);

    await collector.stop();
    expect(collector.isConnected()).toBe(false);

    collector = undefined;
  });

  // ──────────────────────────────────────────────
  // Spawn failure
  // ──────────────────────────────────────────────

  it("rejects start() for an invalid command", async () => {
    collector = createProcessSpawner(
      "__tracepulse_nonexistent_command_12345__",
    );
    const lines: CapturedLine[] = [];

    await expect(
      collector.start((source, line) => {
        lines.push({ source, line });
      }),
    ).rejects.toThrow("Command not found");

    collector = undefined;
  });
});
