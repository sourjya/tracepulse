/**
 * Unit tests for the log file tailer collector.
 *
 * Verifies that createLogFileTailer correctly watches a file for new lines,
 * handles truncation/rotation, and cleans up resources on stop. Uses real
 * temp files to exercise node:fs.watch behavior.
 *
 * @see src/collectors/log-file-tailer.ts for the implementation
 */

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EventSource } from "@/constants/events";
import { createLogFileTailer } from "@/collectors/log-file-tailer";

/** Small delay to allow fs.watch to fire after writes. */
const WATCH_DELAY_MS = 200;

/** Helper: sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createLogFileTailer", () => {
  let tmpFile: string | undefined;
  let stopFn: (() => Promise<void>) | undefined;

  afterEach(async () => {
    // Clean up collector
    if (stopFn) {
      await stopFn();
      stopFn = undefined;
    }
    // Clean up temp file
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
      tmpFile = undefined;
    }
  });

  /**
   * Creates a temp file with optional initial content and returns its path.
   */
  function createTempFile(content = ""): string {
    tmpFile = path.join(os.tmpdir(), `tracepulse-test-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
    fs.writeFileSync(tmpFile, content);
    return tmpFile;
  }

  it("reads only new lines appended after start", async () => {
    const filePath = createTempFile("existing line\n");
    const collector = createLogFileTailer(filePath);
    const lines: string[] = [];

    await collector.start((_source, line) => lines.push(line));
    stopFn = () => collector.stop();

    fs.appendFileSync(filePath, "new line 1\n");
    await sleep(WATCH_DELAY_MS);

    expect(lines).toEqual(["new line 1"]);
  });

  it("handles multiple lines appended at once", async () => {
    const filePath = createTempFile("");
    const collector = createLogFileTailer(filePath);
    const lines: string[] = [];

    await collector.start((_source, line) => lines.push(line));
    stopFn = () => collector.stop();

    fs.appendFileSync(filePath, "line A\nline B\nline C\n");
    await sleep(WATCH_DELAY_MS);

    expect(lines).toEqual(["line A", "line B", "line C"]);
  });

  it("isConnected() returns true while tailing, false after stop", async () => {
    const filePath = createTempFile("");
    const collector = createLogFileTailer(filePath);

    expect(collector.isConnected()).toBe(false);

    await collector.start(() => {});
    expect(collector.isConnected()).toBe(true);

    await collector.stop();
    stopFn = undefined; // already stopped
    expect(collector.isConnected()).toBe(false);
  });

  it("stop() closes file handles cleanly", async () => {
    const filePath = createTempFile("");
    const collector = createLogFileTailer(filePath);
    const lines: string[] = [];

    await collector.start((_source, line) => lines.push(line));
    await collector.stop();
    stopFn = undefined;

    // Writes after stop should not produce callbacks
    fs.appendFileSync(filePath, "after stop\n");
    await sleep(WATCH_DELAY_MS);

    expect(lines).toEqual([]);
  });

  it("defaults source to 'server-stdout'", async () => {
    const filePath = createTempFile("");
    const collector = createLogFileTailer(filePath);
    const sources: EventSource[] = [];

    await collector.start((source) => sources.push(source));
    stopFn = () => collector.stop();

    fs.appendFileSync(filePath, "test\n");
    await sleep(WATCH_DELAY_MS);

    expect(sources).toEqual(["server-stdout"]);
  });

  it("uses custom source tag when provided", async () => {
    const filePath = createTempFile("");
    const collector = createLogFileTailer(filePath, "server-stderr");
    const sources: EventSource[] = [];

    await collector.start((source) => sources.push(source));
    stopFn = () => collector.stop();

    fs.appendFileSync(filePath, "test\n");
    await sleep(WATCH_DELAY_MS);

    expect(sources).toEqual(["server-stderr"]);
  });

  it("detects file truncation and reads from beginning", async () => {
    const filePath = createTempFile("");
    const collector = createLogFileTailer(filePath);
    const lines: string[] = [];

    await collector.start((_source, line) => lines.push(line));
    stopFn = () => collector.stop();

    // Append initial content
    fs.appendFileSync(filePath, "before truncation\n");
    await sleep(WATCH_DELAY_MS);

    // Truncate and write new content (simulates log rotation)
    fs.writeFileSync(filePath, "after truncation\n");
    await sleep(WATCH_DELAY_MS);

    expect(lines).toContain("before truncation");
    expect(lines).toContain("after truncation");
  });
});
