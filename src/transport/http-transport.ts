/**
 * HTTP transport for Streamable HTTP MCP connections.
 *
 * Creates an HTTP server on localhost that accepts MCP protocol connections
 * via the Streamable HTTP transport. This is opt-in via --http flag and
 * runs alongside the primary stdio transport.
 *
 * Binds to 127.0.0.1 only for security - no external access.
 *
 * @see .kiro/specs/phase3-multi-process/design.md for transport design
 */

import { createServer, type Server } from "node:http";
import { DEFAULT_HTTP_PORT } from "@/constants/services.js";
import { createRestHandler, type RestDeps } from "@/transport/rest-endpoints.js";
import { createAuthMiddleware, createRateLimiter } from "@/transport/rest-auth.js";

/** Public API for the HTTP transport wrapper. */
export interface HttpTransport {
  /** Port the server will bind to. */
  readonly port: number;
  /** Host the server will bind to (always 127.0.0.1). */
  readonly host: string;
  /** Whether the server is currently listening. */
  isListening(): boolean;
  /** Start the HTTP server. Returns a promise that resolves when listening. */
  start(): Promise<void>;
  /** Stop the HTTP server. */
  stop(): Promise<void>;
  /** The underlying HTTP server (for wiring MCP transport). */
  readonly server: Server;
}

/**
 * Create an HTTP transport wrapper.
 *
 * The server handles REST endpoints (GET /health, /api/*) directly and
 * passes other requests to the MCP Streamable HTTP handler.
 *
 * @param port - Port to bind to. Defaults to DEFAULT_HTTP_PORT (9800).
 * @param restDeps - Dependencies for REST endpoints. If not provided, REST endpoints are disabled.
 * @returns HttpTransport instance.
 */
export function createHttpTransport(port: number = DEFAULT_HTTP_PORT, restDeps?: RestDeps): HttpTransport {
  const host = "127.0.0.1";
  let listening = false;

  const server = createServer();
  const restHandler = restDeps ? createRestHandler(restDeps) : null;

  // Wire REST endpoints with auth and rate limiting
  if (restHandler) {
    const apiKey = process.env.TRACEPULSE_API_KEY;
    const auth = createAuthMiddleware(apiKey);
    const rateLimiter = createRateLimiter(60, 60000);

    server.on("request", (req, res) => {
      const result = restHandler({ method: req.method ?? "GET", url: req.url ?? "/" });
      if (result) {
        // Auth check
        const providedKey = req.headers["x-api-key"] as string | undefined;
        if (!auth(providedKey)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Authentication failed" }));
          return;
        }

        // Rate limit check (use API key or IP as client ID)
        const clientId = providedKey ?? req.socket.remoteAddress ?? "unknown";
        if (!rateLimiter.check(clientId)) {
          res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
          res.end(JSON.stringify({ error: "Rate limit exceeded", retry_after_seconds: 60 }));
          return;
        }

        res.writeHead(result.status, {
          "Content-Type": result.contentType,
          "Access-Control-Allow-Origin": "*",
        });
        res.end(result.body);
      }
      // If result is null, the default MCP handler (wired by SDK) processes it
    });
  }

  return {
    port,
    host,
    server,

    isListening(): boolean {
      return listening;
    },

    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.on("error", (err) => {
          const errno = err as NodeJS.ErrnoException;
          if (errno.code === "EADDRINUSE") {
            process.stderr.write(
              `[tracepulse] Port ${port} is already in use. Try --http-port ${port + 1}\n`,
            );
          } else {
            process.stderr.write(
              `[tracepulse] HTTP transport error: ${err.message}\n`,
            );
          }
          reject(err);
        });

        server.listen(port, host, () => {
          listening = true;
          process.stderr.write(
            `[tracepulse] HTTP transport listening on ${host}:${port}\n`,
          );
          resolve();
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (!listening) {
          resolve();
          return;
        }
        server.close(() => {
          listening = false;
          resolve();
        });
      });
    },
  };
}
