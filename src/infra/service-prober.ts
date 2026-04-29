/**
 * TCP/HTTP service prober for connectivity checks.
 *
 * Non-blocking probes with timeouts. Never connects to databases
 * or runs queries - just checks if the port accepts connections.
 */

import { connect } from "node:net";
import { request as httpRequest } from "node:http";

/** Result of a connectivity probe. */
export interface ProbeResult {
  readonly status: "reachable" | "unreachable" | "timeout";
  readonly latency_ms: number;
  readonly error?: string;
  readonly checked_at: number;
}

/** Default probe timeout in milliseconds. */
const PROBE_TIMEOUT_MS = 2000;

/**
 * TCP connectivity probe. Checks if a port accepts connections.
 */
export function probeTcp(host: string, port: number, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = connect({ host, port });

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      socket.destroy();
      resolve({ status: "reachable", latency_ms: Date.now() - start, checked_at: Date.now() });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ status: "timeout", latency_ms: timeoutMs, error: `timeout after ${timeoutMs}ms`, checked_at: Date.now() });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({ status: "unreachable", latency_ms: Date.now() - start, error: err.message, checked_at: Date.now() });
    });
  });
}

/**
 * HTTP connectivity probe. Checks if an HTTP endpoint responds.
 */
export function probeHttp(host: string, port: number, path: string = "/", timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const start = Date.now();

    const req = httpRequest({ hostname: host, port, path, timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ status: "reachable", latency_ms: Date.now() - start, checked_at: Date.now() });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ status: "timeout", latency_ms: timeoutMs, error: `timeout after ${timeoutMs}ms`, checked_at: Date.now() });
    });

    req.on("error", (err) => {
      resolve({ status: "unreachable", latency_ms: Date.now() - start, error: err.message, checked_at: Date.now() });
    });

    req.end();
  });
}
