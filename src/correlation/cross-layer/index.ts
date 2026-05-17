/**
 * Cross-layer correlation engine (DevLoop Agent).
 *
 * Re-exports the public API for signal aggregation, pattern matching,
 * and diagnosis generation.
 *
 * @see .kiro/specs/devloop-agent/design.md for architecture overview
 */

export { aggregateSignals } from "@/correlation/cross-layer/signal-aggregator.js";
export { PATTERNS } from "@/correlation/cross-layer/pattern-library.js";
export { matchPattern, fillTemplate, diagnose } from "@/correlation/cross-layer/correlation-matcher.js";
export type {
  LayerSignal,
  SignalLayer,
  CrossLayerPattern,
  SignalMatcher,
  Diagnosis,
  SignalSnapshot,
  AggregatorDeps,
} from "@/correlation/cross-layer/types.js";
