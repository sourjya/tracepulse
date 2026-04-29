/**
 * Infrastructure monitor - background probe loop with cache.
 *
 * Discovers services from config files, probes them periodically,
 * caches results for instant MCP tool responses.
 *
 * Non-blocking: probes run in parallel with Promise.all.
 * Thread-safe: cache is atomically swapped after all probes complete.
 */

import type { DiscoveredService } from "@/infra/config-scanner.js";
import { scanEnvForServices } from "@/infra/config-scanner.js";
import { probeTcp, probeHttp, type ProbeResult } from "@/infra/service-prober.js";

/** Cached service status. */
export interface ServiceStatus {
  readonly service: DiscoveredService;
  readonly current: ProbeResult;
  readonly history: ProbeResult[];
}

/** Public API for the infrastructure monitor. */
export interface InfraMonitor {
  start(): void;
  stop(): void;
  getAll(): ServiceStatus[];
  getByName(name: string): ServiceStatus | undefined;
  getSummary(): string;
}

const PROBE_INTERVAL_MS = 60_000;
const MAX_HISTORY = 10;

/**
 * Create an infrastructure monitor.
 *
 * @param envFiles - Env files to scan (defaults to common locations).
 * @returns InfraMonitor instance.
 */
export function createInfraMonitor(envFiles?: string[]): InfraMonitor {
  const services = scanEnvForServices(envFiles);
  let cache: ServiceStatus[] = services.map((s) => ({
    service: s,
    current: { status: "unreachable", latency_ms: 0, error: "not probed yet", checked_at: 0 },
    history: [],
  }));
  let timer: ReturnType<typeof setInterval> | null = null;

  /** Probe a single service. */
  async function probeService(svc: DiscoveredService): Promise<ProbeResult> {
    if (svc.protocol === "http" || svc.protocol === "https") {
      return probeHttp(svc.host, svc.port);
    }
    return probeTcp(svc.host, svc.port);
  }

  /** Run all probes in parallel, update cache atomically. */
  async function runProbes(): Promise<void> {
    const results = await Promise.all(services.map(probeService));

    // Atomic cache swap
    cache = services.map((svc, i) => {
      const prev = cache.find((c) => c.service.host === svc.host && c.service.port === svc.port);
      const history = prev ? [results[i], ...prev.history].slice(0, MAX_HISTORY) : [results[i]];
      return { service: svc, current: results[i], history };
    });
  }

  return {
    start(): void {
      // Initial probe
      runProbes().catch((err) => {
        process.stderr.write(`[tracepulse] infra probe error: ${err instanceof Error ? err.message : String(err)}\n`);
      });
      // Periodic probes
      timer = setInterval(() => {
        runProbes().catch(() => {});
      }, PROBE_INTERVAL_MS);
      if (typeof timer === "object" && "unref" in timer) timer.unref();

      if (services.length > 0) {
        process.stderr.write(`[tracepulse] Discovered ${services.length} infrastructure service(s)\n`);
      }
    },

    stop(): void {
      if (timer) { clearInterval(timer); timer = null; }
    },

    getAll(): ServiceStatus[] {
      return cache;
    },

    getByName(name: string): ServiceStatus | undefined {
      return cache.find((c) => c.service.name.toLowerCase() === name.toLowerCase());
    },

    getSummary(): string {
      if (services.length === 0) return "No infrastructure services discovered from .env files";
      const reachable = cache.filter((c) => c.current.status === "reachable").length;
      return `${reachable}/${services.length} services reachable`;
    },
  };
}
