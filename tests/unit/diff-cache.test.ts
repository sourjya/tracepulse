/**
 * Tests for pre-computed diff correlation cache.
 *
 * Auto-runs correlate_with_diff on HMR events and caches the result.
 * Subsequent calls return the cached result instantly.
 *
 * @see src/correlation/diff-cache.ts for implementation
 */

import { describe, it, expect, vi } from "vitest";
import { createDiffCache } from "@/correlation/diff-cache.js";

describe("DiffCache", () => {
  it("returns null when no correlation has been computed", () => {
    const cache = createDiffCache();
    expect(cache.get()).toBeNull();
  });

  it("stores and returns cached correlation result", () => {
    const cache = createDiffCache();
    const result = { files_changed: ["src/app.ts"], correlations: [] };
    cache.set(result);
    expect(cache.get()).toEqual(result);
  });

  it("invalidates cache after TTL", () => {
    const cache = createDiffCache(100); // 100ms TTL
    cache.set({ files_changed: [], correlations: [] });
    expect(cache.get()).not.toBeNull();

    // Advance time past TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    expect(cache.get()).toBeNull();
    vi.useRealTimers();
  });

  it("replaces previous cached result", () => {
    const cache = createDiffCache();
    cache.set({ files_changed: ["a.ts"], correlations: [] });
    cache.set({ files_changed: ["b.ts"], correlations: [] });
    expect(cache.get()!.files_changed).toEqual(["b.ts"]);
  });
});
