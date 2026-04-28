/**
 * Health endpoint prober for dev server liveness checking.
 *
 * Periodically GETs a configurable health endpoint and stores the result.
 * Surfaces in get_runtime_status and get_health_summary.
 *
 * @see .kiro/specs/m8-infra-awareness/requirements.md Feature 3
 */

import { request } from "node:http";

/** Result of a health probe. */
export interface HealthProbeResult {
  readonly status: "healthy" | "unhealthy" | "unreachable";
  readonly http_status?: number;
  readonly duration_ms: number;
  readonly checked_at: number;
  readonly error?: string;
}

/** Public API for the health prober. */
export interface HealthProber {
  start(): void;
  stop(): void;
  getLastResult(): HealthProbeResult | null;
}

/**
 * Create a health endpoint prober.
 *
 * @param url - Health endpoint URL (e.g., http://localhost:8000/health).
 * @param intervalMs - Probe interval in milliseconds (default 30000).
 * @returns HealthProber instance.
 */
export function createHealthProber(url: string, intervalMs: number = 30000): HealthProber {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastResult: HealthProbeResult | null = null;

  function probe(): void {
    const start = Date.now();
    const parsed = new URL(url);

    const req = request(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, timeout: 5000 },
      (res) => {
        const duration = Date.now() - start;
        lastResult = {
          status: res.statusCode && res.statusCode >= 200 && res.statusCode < 400 ? "healthy" : "unhealthy",
          http_status: res.statusCode,
          duration_ms: duration,
          checked_at: Date.now(),
        };
        res.resume();
      },
    );

    req.on("error", (err) => {
      lastResult = {
        status: "unreachable",
        duration_ms: Date.now() - start,
        checked_at: Date.now(),
        error: err.message,
      };
    });

    req.on("timeout", () => {
      req.destroy();
      lastResult = {
        status: "unreachable",
        duration_ms: Date.now() - start,
        checked_at: Date.now(),
        error: "timeout after 5s",
      };
    });

    req.end();
  }

  return {
    start(): void {
      probe();
      timer = setInterval(probe, intervalMs);
      if (typeof timer === "object" && "unref" in timer) timer.unref();
    },

    stop(): void {
      if (timer) { clearInterval(timer); timer = null; }
    },

    getLastResult(): HealthProbeResult | null {
      return lastResult;
    },
  };
}
