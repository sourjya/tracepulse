/**
 * Types for the cross-layer correlation engine (DevLoop Agent).
 *
 * Defines the data model for multi-layer signal aggregation and pattern
 * matching. LayerSignals are collected from backend, frontend, git, process,
 * and build layers. CrossLayerPatterns define known failure signatures.
 * The correlation matcher produces Diagnoses.
 *
 * @see .kiro/specs/devloop-agent/design.md for architecture
 */

// ──────────────────────────────────────────────
// Layer Signal
// ──────────────────────────────────────────────

/** Which layer produced a signal. */
export type SignalLayer = "backend" | "frontend" | "build" | "git" | "process";

/**
 * A normalized signal from any layer, used as input to pattern matching.
 * All signals share this shape regardless of origin.
 */
export interface LayerSignal {
  /** Which layer produced this signal. */
  readonly layer: SignalLayer;
  /** Signal type within the layer (e.g., "http-200", "type-error", "file-changed"). */
  readonly type: string;
  /** Unix ms when the signal occurred. */
  readonly timestamp: number;
  /** Human-readable detail for diagnosis templates. */
  readonly detail: string;
  /** Layer-specific metadata for template interpolation. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ──────────────────────────────────────────────
// Pattern Matching
// ──────────────────────────────────────────────

/**
 * A matcher for a single signal within a pattern.
 * All fields must match for the signal to satisfy this matcher.
 */
export interface SignalMatcher {
  /** Which layer the signal must come from. */
  readonly layer: SignalLayer;
  /** Signal type to match. String for exact match. */
  readonly type: string;
  /** Optional metadata key-value pairs that must be present. */
  readonly metadataMatch?: Readonly<Record<string, unknown>>;
}

/**
 * A known cross-layer failure signature.
 * When all requiredSignals match within timeWindowMs, the pattern fires.
 */
export interface CrossLayerPattern {
  /** Unique pattern identifier (e.g., "backend-ok-frontend-error"). */
  readonly id: string;
  /** Human-readable name for display. */
  readonly name: string;
  /** What this pattern means when it fires. */
  readonly description: string;
  /** All of these must match for the pattern to fire. */
  readonly requiredSignals: readonly SignalMatcher[];
  /** If present and matched, boost confidence. */
  readonly optionalSignals?: readonly SignalMatcher[];
  /** Base confidence score (0-100) when required signals match. */
  readonly baseConfidence: number;
  /** Template string with {placeholders} filled from signal metadata. */
  readonly diagnosisTemplate: string;
  /** Suggested fix template with {placeholders}. */
  readonly suggestedFix: string;
  /** Maximum time span (ms) for all signals to correlate. */
  readonly timeWindowMs: number;
  /**
   * Minimum number of distinct signals (required + optional) that must match
   * before this pattern's diagnosis is surfaced. Implements the "quiet agent"
   * principle from v2 spec: single-signal matches are logged but not shown.
   * Default: 2 (enforced by the matcher if omitted).
   */
  readonly minSignals?: number;
  /**
   * Minimum confidence required before proposed_fix is included in output.
   * Below this floor, the diagnosis is surfaced but without an actionable fix.
   * Default: pattern's baseConfidence (always include fix if pattern fires).
   */
  readonly confidenceFloor?: number;
}

// ──────────────────────────────────────────────
// Diagnosis Output
// ──────────────────────────────────────────────

/**
 * A diagnosis produced by the correlation engine.
 * Represents a matched pattern with filled templates and confidence.
 */
export interface Diagnosis {
  /** Which pattern produced this diagnosis. */
  readonly pattern_id: string;
  /** Confidence score (0-100). Higher = more certain. */
  readonly confidence: number;
  /** Human-readable diagnosis (filled template). */
  readonly diagnosis: string;
  /** Suggested fix (filled template). Always present for reference. */
  readonly suggested_fix: string;
  /**
   * Actionable fix to apply. Null when confidence is below the pattern's
   * confidenceFloor — the diagnosis is shown but the fix is withheld to
   * avoid incorrect auto-intervention.
   */
  readonly proposed_fix: string | null;
  /** Signals that matched this pattern. */
  readonly signals_used: readonly LayerSignal[];
  /** Which layers participated in this diagnosis. */
  readonly layers_involved: readonly string[];
}

// ──────────────────────────────────────────────
// Aggregator Dependencies
// ──────────────────────────────────────────────

/**
 * Result of signal aggregation including metadata about collection.
 * Used by the tool handler to populate snapshot_timestamp and missing_signals.
 */
export interface SignalSnapshot {
  /** Collected signals from all layers. */
  readonly signals: readonly LayerSignal[];
  /** Unix ms when collection started. */
  readonly snapshot_timestamp: number;
  /** Layers that failed to return data or returned empty. */
  readonly missing_signals: readonly string[];
  /** Which layers contributed at least one signal. */
  readonly active_layers: readonly string[];
}

/**
 * Dependencies injected into the signal aggregator.
 * Allows testing with mocks and avoids tight coupling to concrete implementations.
 */
export interface AggregatorDeps {
  /** Read recent events from the ring buffer. */
  readonly getBackendEvents: (since: number) => import("@/types/events.js").RuntimeEvent[];
  /** Read recent frontend errors. */
  readonly getFrontendErrors: (since: number) => import("@/correlation/types.js").FrontendError[];
  /** Get changed files since timestamp. Returns file paths or null if git unavailable. */
  readonly getGitChanges: (since: number) => Promise<string[] | null>;
  /** Get last hot-reload timestamp, or null if none. */
  readonly getLastHotReload: () => number | null;
  /** Get last server restart timestamp, or null if none. */
  readonly getLastRestart: () => number | null;
  /** Get current working directory for git operations. */
  readonly cwd: string;
}
