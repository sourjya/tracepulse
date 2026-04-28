/**
 * Watch mode module — hot-reload detection and watch controller.
 *
 * Re-exports the public API for Phase 2 watch functionality.
 *
 * @see src/watch/hot-reload-patterns.ts for pattern definitions
 * @see src/watch/hot-reload-detector.ts for detection logic
 */

export { DEFAULT_PATTERNS, type HotReloadPattern } from "./hot-reload-patterns.js";
export { detectHotReload } from "./hot-reload-detector.js";
export { watchForErrors, type WatchResult } from "./watch-controller.js";
