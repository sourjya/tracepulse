/**
 * Log collector HTTP server for receiving frontend errors.
 *
 * Accepts POST /api/v1/errors with JSON payloads describing browser
 * HTTP failures. Normalizes them to FrontendError and emits via callback.
 * Binds to 127.0.0.1 only for security.
 *
 * @see .kiro/specs/phase4-correlation/design.md for log collector design
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { FrontendError } from "@/correlation/types.js";
import { validateCrashReport, crashReportToEvent } from "@/correlation/frontend-crash-bridge.js";
import type { RuntimeEvent } from "@/types/events.js";

/** Public API for the log collector. */
export interface LogCollector {
  start(): Promise<void>;
  stop(): Promise<void>;
  port(): number;
  host(): string;
}

/**
 * Create a log collector HTTP server.
 *
 * @param listenPort - Port to bind to (0 for random).
 * @param onError - Callback invoked for each valid frontend error received.
 * @returns LogCollector instance.
 */
export function createLogCollector(
  listenPort: number,
  onError: (error: FrontendError) => void,
  onCrash?: (event: RuntimeEvent) => void,
): LogCollector {
  const bindHost = "127.0.0.1";
  let server: Server;
  let actualPort = listenPort;

  /**
   * Read the full request body as a string.
   * Rejects if body exceeds 64KB.
   */
  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 65536) {
          reject(new Error("Body too large"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  }

  /** Proportional token bucket rate limiter: 100 requests per second. */
  const RATE_LIMIT = 100;
  const REFILL_INTERVAL_MS = 1000;
  let tokenCount = RATE_LIMIT;
  let lastRefill = Date.now();

  function checkRateLimit(): boolean {
    const now = Date.now();
    const elapsed = now - lastRefill;
    // Proportional refill based on elapsed time
    if (elapsed > 0) {
      const refill = Math.floor((elapsed / REFILL_INTERVAL_MS) * RATE_LIMIT);
      if (refill > 0) {
        tokenCount = Math.min(RATE_LIMIT, tokenCount + refill);
        lastRefill = now;
      }
    }
    if (tokenCount <= 0) return false;
    tokenCount--;
    return true;
  }

  /** Handle incoming HTTP requests. */
  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Security: reject cross-origin requests (only localhost should POST)
    const origin = req.headers.origin;
    if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Cross-origin requests not allowed" }));
      return;
    }

    // Health check (exempt from rate limiting)
    if (req.method === "GET" && req.url === "/api/v1/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // Rate limit check
    if (!checkRateLimit()) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Rate limit exceeded (100 req/s)" }));
      return;
    }

    // Error ingestion
    if (req.method === "POST" && req.url === "/api/v1/errors") {
      readBody(req)
        .then((body) => {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(body) as Record<string, unknown>;
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
          }

          const url = payload.url as string;
          if (!url) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "url is required" }));
            return;
          }

          let parsedPath: string;
          try {
            parsedPath = new URL(url).pathname;
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid URL format" }));
            return;
          }

          const fe: FrontendError = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            url,
            path: parsedPath,
            method: (payload.method as string) ?? "GET",
            statusCode: (payload.statusCode as number) ?? 0,
            statusText: (payload.statusText as string) ?? "",
            responseHeaders: (payload.responseHeaders as Record<string, string>) ?? {},
            source: "log-collector",
          };

          onError(fe);
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: fe.id }));
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === "Body too large") {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Payload too large" }));
          } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: msg }));
          }
        });
      return;
    }

    // Frontend crash ingestion (ErrorBoundary bridge)
    if (req.method === "POST" && req.url === "/api/v1/crashes" && onCrash) {
      readBody(req)
        .then((body) => {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(body) as Record<string, unknown>;
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
          }

          const report = validateCrashReport(payload);
          if (!report) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "message is required" }));
            return;
          }

          const event = crashReportToEvent(report);
          onCrash(event);
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ fingerprint: event.fingerprint }));
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(msg === "Body too large" ? 413 : 500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: msg }));
        });
      return;
    }

    res.writeHead(404);
    res.end();
  }

  return {
    start(): Promise<void> {
      return new Promise((resolve) => {
        server = createServer(handleRequest);
        server.listen(listenPort, bindHost, () => {
          const addr = server.address();
          if (addr && typeof addr === "object") {
            actualPort = addr.port;
          }
          resolve();
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (!server) { resolve(); return; }
        server.close(() => resolve());
      });
    },

    port(): number {
      return actualPort;
    },

    host(): string {
      return bindHost;
    },
  };
}
