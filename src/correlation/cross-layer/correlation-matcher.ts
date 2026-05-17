/**
 * Cross-layer correlation matcher.
 *
 * Pure functions that match LayerSignals against CrossLayerPatterns
 * and produce Diagnoses. No I/O, no side effects — takes signals in,
 * returns diagnoses out.
 *
 * @see .kiro/specs/devloop-agent/design.md for matching algorithm
 */

import type {
  LayerSignal,
  CrossLayerPattern,
  SignalMatcher,
  Diagnosis,
} from "@/correlation/cross-layer/types.js";

/** Maximum diagnoses to return from a single call. */
const MAX_DIAGNOSES = 3;

/** Confidence boost when an optional signal matches. */
const OPTIONAL_SIGNAL_BOOST = 10;

// ──────────────────────────────────────────────
// Signal Matching
// ──────────────────────────────────────────────

/**
 * Check if a single signal satisfies a matcher.
 *
 * Matches on layer, type (exact string match), and optional metadata
 * key-value constraints.
 */
function signalMatchesMatcher(signal: LayerSignal, matcher: SignalMatcher): boolean {
  if (signal.layer !== matcher.layer) return false;
  if (signal.type !== matcher.type) return false;

  // Check metadata constraints if specified
  if (matcher.metadataMatch) {
    for (const [key, value] of Object.entries(matcher.metadataMatch)) {
      if (signal.metadata[key] !== value) return false;
    }
  }

  return true;
}

/**
 * Check if all required signals in a pattern are present within the time window.
 *
 * For a pattern to match:
 * 1. Every requiredSignal must have at least one matching LayerSignal
 * 2. The time span between the earliest and latest matched signals must be <= timeWindowMs
 *
 * @param signals - Available signals to match against.
 * @param pattern - Pattern to check.
 * @returns true if all required signals match within the time window.
 */
export function matchPattern(signals: readonly LayerSignal[], pattern: CrossLayerPattern): boolean {
  const matchedTimestamps: number[] = [];

  for (const required of pattern.requiredSignals) {
    const match = signals.find((s) => signalMatchesMatcher(s, required));
    if (!match) return false;
    matchedTimestamps.push(match.timestamp);
  }

  // Check time window: span between earliest and latest must be <= timeWindowMs
  if (matchedTimestamps.length > 1) {
    const earliest = Math.min(...matchedTimestamps);
    const latest = Math.max(...matchedTimestamps);
    if (latest - earliest > pattern.timeWindowMs) return false;
  }

  return true;
}

// ──────────────────────────────────────────────
// Template Filling
// ──────────────────────────────────────────────

/**
 * Replace {layer.key} placeholders in a template with signal metadata values.
 *
 * Placeholder format: {layer.metadataKey}
 * If the layer or key is not found, the placeholder is left as-is.
 *
 * @param template - Template string with {placeholders}.
 * @param signals - Signals to extract values from.
 * @returns Filled template string.
 */
export function fillTemplate(template: string, signals: readonly LayerSignal[]): string {
  return template.replace(/\{(\w+)\.(\w+)\}/g, (match, layer, key) => {
    const signal = signals.find((s) => s.layer === layer);
    if (!signal) return match;
    const value = signal.metadata[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

// ──────────────────────────────────────────────
// Full Diagnosis Pipeline
// ──────────────────────────────────────────────

/**
 * Run the full diagnosis pipeline: match signals against patterns, fill templates,
 * compute confidence, and return sorted results.
 *
 * @param signals - Aggregated signals from all layers.
 * @param patterns - Pattern library to match against.
 * @returns Top diagnoses sorted by confidence descending. Max 3.
 */
export function diagnose(
  signals: readonly LayerSignal[],
  patterns: readonly CrossLayerPattern[],
): Diagnosis[] {
  if (signals.length === 0) return [];

  const diagnoses: Diagnosis[] = [];

  for (const pattern of patterns) {
    if (!matchPattern(signals, pattern)) continue;

    // Collect the signals that matched this pattern
    const matchedSignals: LayerSignal[] = [];
    for (const required of pattern.requiredSignals) {
      const match = signals.find((s) => signalMatchesMatcher(s, required));
      if (match) matchedSignals.push(match);
    }

    // Check optional signals for confidence boost
    let confidence = pattern.baseConfidence;
    if (pattern.optionalSignals) {
      for (const optional of pattern.optionalSignals) {
        const match = signals.find((s) => signalMatchesMatcher(s, optional));
        if (match) {
          confidence = Math.min(100, confidence + OPTIONAL_SIGNAL_BOOST);
          matchedSignals.push(match);
        }
      }
    }

    // Fill templates with signal data
    const diagnosis = fillTemplate(pattern.diagnosisTemplate, matchedSignals);
    const suggestedFix = fillTemplate(pattern.suggestedFix, matchedSignals);

    // Deduplicate layers
    const layers = [...new Set(matchedSignals.map((s) => s.layer))];

    diagnoses.push({
      pattern_id: pattern.id,
      confidence,
      diagnosis,
      suggested_fix: suggestedFix,
      signals_used: matchedSignals,
      layers_involved: layers,
    });
  }

  // Sort by confidence descending, limit to top 3
  diagnoses.sort((a, b) => b.confidence - a.confidence);
  return diagnoses.slice(0, MAX_DIAGNOSES);
}
