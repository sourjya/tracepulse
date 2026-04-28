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

  /** Handle incoming HTTP requests. */
  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Health check
    if (req.method === "GET" && req.url === "/api/v1/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
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

          const fe: FrontendError = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            url,
            path: new URL(url).pathname,
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
