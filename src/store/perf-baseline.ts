/**
 * Performance baseline tracker for HTTP endpoint response times.
 *
 * Collects response durations from HTTP access log events and computes
 * per-endpoint percentiles (P50, P95, max). Enables agents to detect
 * performance regressions by comparing current metrics against baselines.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for perf baseline design
 */

/** Per-endpoint performance metrics. */
export interface EndpointMetrics {
  readonly path: string;
  readonly request_count: number;
  readonly p50_ms: number;
  readonly p95_ms: number;
  readonly max_ms: number;
  readonly slow_count: number;
}

/** Public API for the perf baseline tracker. */
export interface PerfBaseline {
  /** Record a request duration for an endpoint. */
  record(path: string, duration_ms: number): void;
  /** Get metrics for all tracked endpoints. */
  getAll(limit?: number): EndpointMetrics[];
  /** Get metrics for a specific endpoint. */
  getByPath(path: string): EndpointMetrics | null;
}

/** Slow request threshold in milliseconds. */
const SLOW_THRESHOLD_MS = 1000;
/** Maximum durations to retain per endpoint. */
const MAX_SAMPLES_PER_ENDPOINT = 100;

/**
 * Compute a percentile from a sorted array of numbers.
 *
 * @param sorted - Pre-sorted array of numbers (ascending).
 * @param p - Percentile (0-1), e.g., 0.5 for P50, 0.95 for P95.
 * @returns The value at the given percentile.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Maximum endpoints to track before evicting least-used. */
const MAX_ENDPOINTS = 100;

/**
 * Normalize a URL path for aggregation.
 * Replaces UUIDs and numeric IDs with placeholders so
 * /api/users/123 and /api/users/456 aggregate together.
 *
 * @param path - Raw URL path.
 * @returns Normalized path with ID placeholders.
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:uuid")
    .replace(/\/\d+/g, "/:id");
}

/**
 * Create a performance baseline tracker.
 *
 * @returns PerfBaseline instance.
 */
export function createPerfBaseline(): PerfBaseline {
  /** Map of endpoint path to recorded durations. */
  const endpoints = new Map<string, number[]>();

  return {
    record(path: string, duration_ms: number): void {
      const normalized = normalizePath(path);
      let durations = endpoints.get(normalized);
      if (!durations) {
        // Evict least-used endpoint if over limit
        if (endpoints.size >= MAX_ENDPOINTS) {
          let minKey = "";
          let minLen = Infinity;
          for (const [k, v] of endpoints) {
            if (v.length < minLen) { minLen = v.length; minKey = k; }
          }
          if (minKey) endpoints.delete(minKey);
        }
        durations = [];
        endpoints.set(normalized, durations);
      }
      durations.push(duration_ms);
      // Evict oldest samples when over limit
      if (durations.length > MAX_SAMPLES_PER_ENDPOINT) {
        durations.shift();
      }
    },

    getAll(limit = 20): EndpointMetrics[] {
      const results: EndpointMetrics[] = [];
      for (const [path, durations] of endpoints) {
        const sorted = [...durations].sort((a, b) => a - b);
        results.push({
          path,
          request_count: durations.length,
          p50_ms: Math.round(percentile(sorted, 0.5)),
          p95_ms: Math.round(percentile(sorted, 0.95)),
          max_ms: Math.round(sorted[sorted.length - 1]),
          slow_count: durations.filter((d) => d >= SLOW_THRESHOLD_MS).length,
        });
      }
      // Sort by request count descending
      results.sort((a, b) => b.request_count - a.request_count);
      return results.slice(0, limit);
    },

    getByPath(path: string): EndpointMetrics | null {
      const durations = endpoints.get(path);
      if (!durations || durations.length === 0) return null;
      const sorted = [...durations].sort((a, b) => a - b);
      return {
        path,
        request_count: durations.length,
        p50_ms: Math.round(percentile(sorted, 0.5)),
        p95_ms: Math.round(percentile(sorted, 0.95)),
        max_ms: Math.round(sorted[sorted.length - 1]),
        slow_count: durations.filter((d) => d >= SLOW_THRESHOLD_MS).length,
      };
    },
  };
}
