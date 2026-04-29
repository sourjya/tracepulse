/**
 * Log file tailer collector for TracePulse.
 *
 * Watches a log file using node:fs.watch and emits new lines as they're
 * appended. Handles file creation waiting, truncation/rotation detection,
 * and graceful cleanup. Used in "attach" mode where TracePulse monitors
 * an existing log file rather than spawning a child process.
 *
 * @see src/types/collectors.ts for the Collector interface
 * @see src/constants/limits.ts for LOG_FILE_WAIT_TIMEOUT_SECONDS
 */

import * as fs from "node:fs";
import { open, stat } from "node:fs/promises";
import * as path from "node:path";
import type { FileHandle } from "node:fs/promises";
import type { FSWatcher } from "node:fs";
import type { EventSource } from "@/constants/events.js";
import type { Collector } from "@/types/collectors.js";
import { LOG_FILE_WAIT_TIMEOUT_SECONDS } from "@/constants/limits.js";

/**
 * Creates a Collector that tails a log file for new lines.
 *
 * On start, seeks to the end of the file and watches for changes.
 * If the file doesn't exist, waits up to LOG_FILE_WAIT_TIMEOUT_SECONDS
 * for it to appear before rejecting.
 *
 * @param filePath - Absolute or relative path to the log file to tail
 * @param source - EventSource tag for emitted lines. Defaults to 'server-stdout'.
 * @returns A Collector that emits lines via the onLine callback
 */
export function createLogFileTailer(
  filePath: string,
  source: EventSource = "server-stdout",
): Collector {
  /** File handle for reading new bytes. */
  let fileHandle: FileHandle | null = null;
  /** fs.watch watcher instance. */
  let watcher: FSWatcher | null = null;
  /** Current read position in the file (byte offset). */
  let readPosition = 0;
  /** Whether the collector is actively watching. */
  let connected = false;
  /** Callback for emitting lines to the pipeline. */
  let onLine: ((source: EventSource, line: string) => void) | null = null;
  /** Incomplete line buffer for partial reads (no trailing newline yet). */
  let partialLine = "";

  /**
   * Reads new bytes from the file starting at readPosition,
   * splits into complete lines, and calls onLine for each.
   * Handles truncation by resetting position when file shrinks.
   */
  async function readNewLines(): Promise<void> {
    if (!fileHandle || !onLine) return;

    try {
      const fileStat = await stat(filePath);
      const fileSize = fileStat.size;

      // Truncation detection: file shrank, reset to beginning
      if (fileSize < readPosition) {
        readPosition = 0;
        partialLine = "";
      }

      if (fileSize <= readPosition) return;

      const bytesToRead = fileSize - readPosition;
      const buffer = Buffer.alloc(bytesToRead);
      const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, readPosition);
      readPosition += bytesRead;

      // Decode UTF-8, replacing invalid sequences to handle binary data gracefully
      const text = partialLine + buffer.subarray(0, bytesRead).toString("utf-8");
      const lines = text.split("\n");

      // Last element is either empty (line ended with \n) or a partial line
      partialLine = lines.pop() ?? "";

      for (const line of lines) {
        if (line.length > 0) {
          onLine(source, line);
        }
      }
    } catch (err) {
      // Only ignore ENOENT (file deleted/rotated) - surface other errors
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        process.stderr.write(
          `[tracepulse] log tailer error (${code ?? "unknown"}): ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
  }

  /**
   * Waits for a file to be created in its parent directory.
   * Rejects after LOG_FILE_WAIT_TIMEOUT_SECONDS if the file never appears.
   */
  function waitForFile(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const dir = path.dirname(filePath);
      const basename = path.basename(filePath);
      const timeoutMs = LOG_FILE_WAIT_TIMEOUT_SECONDS * 1000;

      const timer = setTimeout(() => {
        dirWatcher.close();
        reject(new Error(`Log file ${filePath} did not appear within ${LOG_FILE_WAIT_TIMEOUT_SECONDS}s`));
      }, timeoutMs);

      const dirWatcher = fs.watch(dir, (eventType, filename) => {
        if (filename === basename && fs.existsSync(filePath)) {
          clearTimeout(timer);
          dirWatcher.close();
          resolve();
        }
      });
    });
  }

  return {
    /**
     * Start tailing the log file. Opens the file, seeks to end,
     * and begins watching for changes. If the file doesn't exist,
     * waits for it to appear.
     *
     * @param callback - Called with (source, line) for each new complete line
     * @throws Error if the file doesn't appear within the timeout
     */
    async start(callback: (source: EventSource, line: string) => void): Promise<void> {
      onLine = callback;

      // Wait for file if it doesn't exist yet
      if (!fs.existsSync(filePath)) {
        await waitForFile();
      }

      // Open file and seek to end
      fileHandle = await open(filePath, "r");
      const fileStat = await stat(filePath);
      readPosition = fileStat.size;

      // Watch for changes
      watcher = fs.watch(filePath, () => {
        void readNewLines();
      });

      connected = true;
    },

    /**
     * Stop tailing. Closes the file watcher and file handle.
     * Safe to call multiple times.
     */
    async stop(): Promise<void> {
      connected = false;
      onLine = null;
      partialLine = "";

      if (watcher) {
        watcher.close();
        watcher = null;
      }

      if (fileHandle) {
        await fileHandle.close();
        fileHandle = null;
      }
    },

    /**
     * Whether the collector is actively watching the file.
     *
     * @returns true if start() has been called and stop() has not
     */
    isConnected(): boolean {
      return connected;
    },
  };
}
