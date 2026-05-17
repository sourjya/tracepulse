/**
 * Timeout-aware stdout wrapper for MCP stdio transport.
 *
 * Prevents indefinite hangs when the MCP client (Kiro CLI) stops reading
 * from the stdio pipe, causing backpressure. Without this, the MCP SDK's
 * StdioServerTransport.send() blocks forever waiting for 'drain'.
 *
 * The wrapper intercepts write() calls and enforces a drain timeout:
 * if the pipe doesn't drain within DRAIN_TIMEOUT_MS, the write resolves
 * anyway (data is still buffered by the OS, just not acknowledged).
 *
 * @see https://nodejs.org/api/stream.html#writablewritechunk-encoding-callback
 */

import { Writable } from "node:stream";

/**
 * Maximum time (ms) to wait for stdout drain before proceeding.
 * 5 seconds is generous — if Kiro hasn't read in 5s, it's stalled.
 */
const DRAIN_TIMEOUT_MS = 5_000;

/**
 * Create a stdout wrapper that never blocks indefinitely on backpressure.
 *
 * Proxies all writes to the real stdout. If write() returns false (pipe full),
 * waits up to DRAIN_TIMEOUT_MS for drain, then proceeds regardless.
 * This prevents the deadlock where TracePulse hangs waiting for Kiro to read.
 *
 * @param realStdout - The actual process.stdout stream.
 * @returns A Writable that can be passed to StdioServerTransport.
 */
export function createSafeStdout(realStdout: NodeJS.WriteStream): Writable {
  return new Writable({
    write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
      const ok = realStdout.write(chunk, encoding);
      if (ok) {
        callback();
      } else {
        // Backpressure: wait for drain with a timeout
        let resolved = false;
        const timer = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          process.stderr.write("[tracepulse] Warning: stdout drain timeout (5s), proceeding anyway\n");
          callback();
        }, DRAIN_TIMEOUT_MS);
        if (typeof timer === "object" && "unref" in timer) timer.unref();

        realStdout.once("drain", () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          callback();
        });
      }
    },

    // Proxy destroy to the real stdout
    destroy(error, callback) {
      callback(error);
    },
  });
}
