/**
 * Debounced error filter for transient build errors.
 *
 * Mid-save syntax errors that auto-resolve on the next save are noise.
 * This filter only surfaces errors that persist for >2 seconds after
 * first seen, reducing false positives from partial file saves.
 *
 * Used by get_build_errors to filter out transient errors.
 */

/** Default debounce window in milliseconds. */
const DEBOUNCE_MS = 2000;

/**
 * Filter events to only those that have persisted beyond the debounce window.
 *
 * An error "persists" if its first_seen timestamp is older than debounce_ms ago.
 * Errors seen for the first time within the debounce window are excluded.
 *
 * @param events - Events to filter.
 * @param debounceMs - Minimum age in ms (default 2000).
 * @returns Events that have persisted beyond the debounce window.
 */
export function filterDebouncedErrors<T extends { first_seen: number }>(
  events: T[],
  debounceMs: number = DEBOUNCE_MS,
): T[] {
  const cutoff = Date.now() - debounceMs;
  return events.filter((e) => e.first_seen <= cutoff);
}
