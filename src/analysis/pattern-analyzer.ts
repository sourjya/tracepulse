/**
 * Bug pattern analyzer for cross-session error intelligence.
 *
 * Detects 8 pattern types from session-level fingerprint data:
 * P1 Recurring, P2 Velocity, P3 Chains, P4 Regression,
 * P5 Flaky, P6 Fixed-but-back, P7 Cascading, P8 Degradation.
 *
 * Operates on SessionRecord arrays - no direct file I/O.
 * Persistence layer feeds data in, MCP tool reads results out.
 *
 * @see .kiro/specs/m20-bug-patterns/requirements.md for pattern taxonomy
 * @see src/persistence/fingerprint-store.ts for data source
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** A single session's fingerprint data. */
export interface SessionRecord {
  readonly session_id: string;
  readonly timestamp: number;
  readonly fingerprints: readonly string[];
}

/** P1: Same fingerprint in 3+ sessions. */
export interface RecurringPattern {
  readonly fingerprint: string;
  readonly sessions: number;
  readonly total_occurrences: number;
}

/** P2: Occurrence rate increasing over time. */
export interface VelocityPattern {
  readonly fingerprint: string;
  readonly rate_change: string;
}

/** P3: Fingerprints that always co-occur. */
export interface ChainPattern {
  readonly primary: string;
  readonly secondary: string[];
  readonly confidence: number;
}

/** P5: Appears in 20-60% of sessions. */
export interface FlakyPattern {
  readonly fingerprint: string;
  readonly presence_rate: number;
}

/** P6: Absent for 3+ sessions then reappeared. */
export interface FixedButBackPattern {
  readonly fingerprint: string;
  readonly clean_sessions: number;
}

/** P8: Total error count trending up. */
export interface DegradationPattern {
  readonly trend: "increasing" | "stable" | "decreasing";
  readonly rate: string;
}

/** Full analysis result with all 8 pattern types. */
export interface PatternAnalysis {
  readonly recurring: RecurringPattern[];
  readonly velocity: VelocityPattern[];
  readonly chains: ChainPattern[];
  readonly flaky: FlakyPattern[];
  readonly fixed_but_back: FixedButBackPattern[];
  readonly degradation: DegradationPattern | null;
  readonly summary: string;
}

/** Public API for the pattern analyzer. */
export interface PatternAnalyzer {
  /** Add a session's fingerprint data. */
  addSession(record: SessionRecord): void;
  /** Run all 8 pattern detectors and return results. */
  analyze(): PatternAnalysis;
  /** Export session records for persistence. */
  exportSessions(): SessionRecord[];
  /** Load session records from persistence. */
  loadSessions(records: readonly SessionRecord[]): void;
}

// ──────────────────────────────────────────────
// Thresholds
// ──────────────────────────────────────────────

/** Minimum sessions for a fingerprint to be "recurring". */
const RECURRING_THRESHOLD = 3;
/** Flaky presence range: 20-60% of sessions. */
const FLAKY_MIN = 0.2;
const FLAKY_MAX = 0.6;
/** Minimum clean sessions before "fixed but came back". */
const FIXED_GAP_THRESHOLD = 3;
/** Minimum sessions needed for meaningful analysis. */
const MIN_SESSIONS_FOR_ANALYSIS = 3;
/** Co-occurrence confidence threshold for chains. */
const CHAIN_CONFIDENCE = 0.8;

// ──────────────────────────────────────────────
// Implementation
// ──────────────────────────────────────────────

/**
 * Create a pattern analyzer instance.
 *
 * @returns PatternAnalyzer with empty state.
 */
export function createPatternAnalyzer(): PatternAnalyzer {
  const sessions: SessionRecord[] = [];

  return {
    addSession(record: SessionRecord): void {
      sessions.push(record);
    },

    loadSessions(records: readonly SessionRecord[]): void {
      sessions.push(...records);
    },

    exportSessions(): SessionRecord[] {
      return [...sessions];
    },

    analyze(): PatternAnalysis {
      const recurring = detectRecurring(sessions);
      const velocity = detectVelocity(sessions);
      const chains = detectChains(sessions);
      const flaky = detectFlaky(sessions);
      const fixedButBack = detectFixedButBack(sessions);
      const degradation = detectDegradation(sessions);

      const parts: string[] = [];
      if (recurring.length) parts.push(`${recurring.length} recurring bug(s)`);
      if (velocity.length) parts.push(`${velocity.length} accelerating`);
      if (chains.length) parts.push(`${chains.length} chain(s)`);
      if (flaky.length) parts.push(`${flaky.length} flaky`);
      if (fixedButBack.length) parts.push(`${fixedButBack.length} fixed-but-back`);
      if (degradation?.trend === "increasing") parts.push("degradation detected");

      const summary = parts.length > 0
        ? parts.join(", ") + "."
        : "No patterns detected.";

      return { recurring, velocity, chains, flaky, fixed_but_back: fixedButBack, degradation, summary };
    },
  };
}

// ──────────────────────────────────────────────
// Pattern Detectors
// ──────────────────────────────────────────────

/**
 * P1: Fingerprints appearing in 3+ sessions.
 * Counts distinct sessions per fingerprint.
 */
function detectRecurring(sessions: readonly SessionRecord[]): RecurringPattern[] {
  const fpSessions = new Map<string, Set<string>>();
  const fpCounts = new Map<string, number>();

  for (const s of sessions) {
    const unique = new Set(s.fingerprints);
    for (const fp of unique) {
      if (!fpSessions.has(fp)) fpSessions.set(fp, new Set());
      fpSessions.get(fp)!.add(s.session_id);
    }
    for (const fp of s.fingerprints) {
      fpCounts.set(fp, (fpCounts.get(fp) ?? 0) + 1);
    }
  }

  const results: RecurringPattern[] = [];
  for (const [fp, sessionSet] of fpSessions) {
    if (sessionSet.size >= RECURRING_THRESHOLD) {
      results.push({
        fingerprint: fp,
        sessions: sessionSet.size,
        total_occurrences: fpCounts.get(fp) ?? 0,
      });
    }
  }
  return results.sort((a, b) => b.sessions - a.sessions);
}

/**
 * P2: Occurrence rate increasing over recent sessions.
 * Compares first half vs second half of session history.
 */
function detectVelocity(sessions: readonly SessionRecord[]): VelocityPattern[] {
  if (sessions.length < 4) return [];

  const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  // Count per-fingerprint occurrences in each half
  const countIn = (slice: readonly SessionRecord[]) => {
    const counts = new Map<string, number>();
    for (const s of slice) {
      for (const fp of s.fingerprints) {
        counts.set(fp, (counts.get(fp) ?? 0) + 1);
      }
    }
    return counts;
  };

  const early = countIn(firstHalf);
  const late = countIn(secondHalf);
  const results: VelocityPattern[] = [];

  for (const [fp, lateCount] of late) {
    const earlyCount = early.get(fp) ?? 0;
    if (earlyCount > 0 && lateCount >= earlyCount * 2) {
      const pct = Math.round(((lateCount - earlyCount) / earlyCount) * 100);
      results.push({ fingerprint: fp, rate_change: `+${pct}%` });
    }
  }
  return results;
}

/**
 * P3: Fingerprints that co-occur in 80%+ of sessions where the primary appears.
 */
function detectChains(sessions: readonly SessionRecord[]): ChainPattern[] {
  if (sessions.length < MIN_SESSIONS_FOR_ANALYSIS) return [];

  // Build per-fingerprint session sets
  const fpSessions = new Map<string, Set<string>>();
  for (const s of sessions) {
    const unique = new Set(s.fingerprints);
    for (const fp of unique) {
      if (!fpSessions.has(fp)) fpSessions.set(fp, new Set());
      fpSessions.get(fp)!.add(s.session_id);
    }
  }

  const results: ChainPattern[] = [];
  const fps = [...fpSessions.keys()];

  for (const primary of fps) {
    const primarySessions = fpSessions.get(primary)!;
    if (primarySessions.size < MIN_SESSIONS_FOR_ANALYSIS) continue;

    const secondary: string[] = [];
    for (const other of fps) {
      if (other === primary) continue;
      const otherSessions = fpSessions.get(other)!;
      // How often does other appear when primary appears?
      let coCount = 0;
      for (const sid of primarySessions) {
        if (otherSessions.has(sid)) coCount++;
      }
      const confidence = coCount / primarySessions.size;
      if (confidence >= CHAIN_CONFIDENCE) {
        secondary.push(other);
      }
    }

    if (secondary.length > 0) {
      // Avoid duplicate chains (A->B and B->A)
      const key = [primary, ...secondary.sort()].join(",");
      if (!results.some(r => [r.primary, ...r.secondary.sort()].join(",") === key)) {
        results.push({ primary, secondary, confidence: CHAIN_CONFIDENCE });
      }
    }
  }
  return results;
}

/**
 * P5: Fingerprints appearing in 20-60% of sessions (intermittent).
 * Requires 5+ sessions for meaningful detection.
 */
function detectFlaky(sessions: readonly SessionRecord[]): FlakyPattern[] {
  if (sessions.length < 5) return [];

  const fpSessions = new Map<string, Set<string>>();
  for (const s of sessions) {
    const unique = new Set(s.fingerprints);
    for (const fp of unique) {
      if (!fpSessions.has(fp)) fpSessions.set(fp, new Set());
      fpSessions.get(fp)!.add(s.session_id);
    }
  }

  const results: FlakyPattern[] = [];
  for (const [fp, sessionSet] of fpSessions) {
    const rate = sessionSet.size / sessions.length;
    if (rate >= FLAKY_MIN && rate <= FLAKY_MAX) {
      results.push({ fingerprint: fp, presence_rate: Math.round(rate * 100) / 100 });
    }
  }
  return results;
}

/**
 * P6: Fingerprint absent for 3+ sessions then reappeared.
 * Scans session timeline for gaps in occurrence.
 */
function detectFixedButBack(sessions: readonly SessionRecord[]): FixedButBackPattern[] {
  if (sessions.length < 5) return [];

  const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  // Build per-fingerprint presence timeline (ordered booleans)
  const fpTimeline = new Map<string, boolean[]>();
  for (const s of sorted) {
    const unique = new Set(s.fingerprints);
    for (const fp of fpTimeline.keys()) {
      fpTimeline.get(fp)!.push(unique.has(fp));
    }
    for (const fp of unique) {
      if (!fpTimeline.has(fp)) {
        // Backfill with false for prior sessions
        const timeline = new Array(sorted.indexOf(s)).fill(false);
        timeline.push(true);
        fpTimeline.set(fp, timeline);
      }
    }
  }

  const results: FixedButBackPattern[] = [];
  for (const [fp, timeline] of fpTimeline) {
    // Find pattern: true...true, false x 3+, true
    let maxGap = 0;
    let currentGap = 0;
    let hadPresenceBefore = false;
    let cameBack = false;

    for (const present of timeline) {
      if (present) {
        if (hadPresenceBefore && currentGap >= FIXED_GAP_THRESHOLD) {
          cameBack = true;
          maxGap = Math.max(maxGap, currentGap);
        }
        hadPresenceBefore = true;
        currentGap = 0;
      } else if (hadPresenceBefore) {
        currentGap++;
      }
    }

    if (cameBack && maxGap >= FIXED_GAP_THRESHOLD) {
      results.push({ fingerprint: fp, clean_sessions: maxGap });
    }
  }
  return results;
}

/**
 * P8: Total error count per session trending upward.
 * Compares first half average to second half average.
 */
function detectDegradation(sessions: readonly SessionRecord[]): DegradationPattern | null {
  if (sessions.length < 4) return null;

  const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  const mid = Math.floor(sorted.length / 2);
  const firstAvg = sorted.slice(0, mid).reduce((s, r) => s + r.fingerprints.length, 0) / mid;
  const secondAvg = sorted.slice(mid).reduce((s, r) => s + r.fingerprints.length, 0) / (sorted.length - mid);

  if (firstAvg === 0 && secondAvg === 0) return null;

  const change = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 100;

  if (change >= 20) {
    return { trend: "increasing", rate: `+${Math.round(change)}% over ${sessions.length} sessions` };
  } else if (change <= -20) {
    return { trend: "decreasing", rate: `${Math.round(change)}% over ${sessions.length} sessions` };
  }
  return { trend: "stable", rate: `${Math.round(change)}% over ${sessions.length} sessions` };
}
