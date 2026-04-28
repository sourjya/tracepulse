/**
 * Hot-reload detector for dev server output.
 *
 * Checks a log line against the hot-reload pattern registry and produces
 * a synthetic RuntimeEvent when a match is found. These events are injected
 * into the event buffer so watch_for_errors can detect that a reload occurred.
 *
 * @see src/watch/hot-reload-patterns.ts for the pattern registry
 * @see .kiro/specs/phase2-watch-mode/design.md for synthetic event shape
 */

import type { RuntimeEvent } from "@/types/events.js";
import { HOT_RELOAD_SIGNAL_SCORE } from "@/constants/watch.js";
import {
  DEFAULT_PATTERNS,
  type HotReloadPattern,
} from "@/watch/hot-reload-patterns.js";

/**
 * Check a log line against hot-reload patterns and produce a synthetic event.
 *
 * Iterates the pattern registry in order. The first matching pattern wins.
 * Returns null if no pattern matches.
 *
 * @param line - Raw log line (already ANSI-stripped by the pipeline).
 * @param patterns - Pattern registry to check against. Defaults to DEFAULT_PATTERNS.
 * @returns A synthetic RuntimeEvent for the hot-reload, or null if no match.
 */
export function detectHotReload(
  line: string,
  patterns: readonly HotReloadPattern[] = DEFAULT_PATTERNS,
): RuntimeEvent | null {
  for (const p of patterns) {
    if (p.pattern.test(line)) {
      const now = Date.now();
      return {
        id: crypto.randomUUID(),
        timestamp: now,
        source: "server-stdout",
        service: "main",
        level: "info",
        message: `Hot-reload detected: ${p.tool} - ${line}`,
        fingerprint: `hotreload:${p.id}`,
        signal_score: HOT_RELOAD_SIGNAL_SCORE,
        signal_strength: "low",
        context: {
          framework: p.tool.toLowerCase(),
        },
        raw: line,
        first_seen: now,
        occurrence_count: 1,
      };
    }
  }
  return null;
}
