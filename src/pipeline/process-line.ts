/**
 * Shared line processing - the core parse pipeline.
 *
 * Strips ANSI, redacts secrets, parses through registry, normalizes.
 * Used by both cli.ts (full pipeline with accumulator) and
 * run-and-watch.ts (simple per-line processing).
 *
 * Single source of truth for: ANSI strip -> redact -> parse -> normalize.
 *
 * @see src/cli.ts createPipeline() for the full pipeline with accumulator
 * @see src/tools/run-and-watch.ts for the simplified usage
 */

import type { RuntimeEvent } from "@/types/events.js";
import type { EventSource } from "@/constants/events.js";
import type { ParserRegistry } from "@/pipeline/parser-registry.js";
import { redact } from "@/pipeline/secret-redactor.js";
import { normalizeEvent, normalizeRawLine } from "@/pipeline/event-normalizer.js";
import { ANSI_ESCAPE_REGEX, MAX_PARSE_INPUT_LENGTH } from "@/constants/limits.js";

/**
 * Process a single raw line through the core pipeline.
 *
 * Steps: strip ANSI -> redact secrets -> try parsers -> normalize.
 * Does NOT handle multi-line accumulation or hot-reload detection.
 *
 * @param rawLine - Raw log line (may contain ANSI codes).
 * @param source - Event source (server-stdout, server-stderr, etc.).
 * @param registry - Parser registry to try matching against.
 * @returns Normalized RuntimeEvent.
 */
export function processRawLine(
  rawLine: string,
  source: EventSource,
  registry: ParserRegistry,
): RuntimeEvent {
  const stripped = rawLine.replace(ANSI_ESCAPE_REGEX, "");
  const redacted = redact(stripped);
  const parseInput = redacted.length > MAX_PARSE_INPUT_LENGTH
    ? redacted.slice(0, MAX_PARSE_INPUT_LENGTH)
    : redacted;
  const parsed = registry.parse(parseInput);
  return parsed
    ? normalizeEvent(parsed, redacted, source, true)
    : normalizeRawLine(redacted, source);
}
