/**
 * Pre-computed diff correlation cache.
 *
 * Caches the result of correlate_with_diff so that when the agent calls it,
 * the result is returned instantly from cache instead of re-running git diff.
 * Cache is populated on HMR events and expires after a configurable TTL.
 *
 * Saves ~1,700 tokens/session by eliminating redundant git diff calls.
 *
 * @see src/tools/correlate-with-diff.ts for the correlation logic
 * @see .kiro/specs/m18-token-wave2/requirements.md W2.4
 */

/** Default cache TTL: 30 seconds. */
const DEFAULT_TTL_MS = 30_000;

/** Cached correlation result shape. */
export interface DiffCacheEntry {
  readonly files_changed: string[];
  readonly correlations: unknown[];
}

/** Public API for the diff correlation cache. */
export interface DiffCache {
  /** Get cached result, or null if expired/empty. */
  get(): DiffCacheEntry | null;
  /** Store a new correlation result. */
  set(entry: DiffCacheEntry): void;
}

/**
 * Create a diff correlation cache with configurable TTL.
 *
 * @param ttlMs - Cache TTL in milliseconds (default 30s).
 * @returns DiffCache instance.
 */
export function createDiffCache(ttlMs = DEFAULT_TTL_MS): DiffCache {
  let cached: DiffCacheEntry | null = null;
  let cachedAt = 0;

  return {
    get(): DiffCacheEntry | null {
      if (!cached) return null;
      if (Date.now() - cachedAt > ttlMs) {
        cached = null;
        return null;
      }
      return cached;
    },

    set(entry: DiffCacheEntry): void {
      cached = entry;
      cachedAt = Date.now();
    },
  };
}
