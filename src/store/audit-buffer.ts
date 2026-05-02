/**
 * Audit buffer for tracking MCP tool invocations.
 *
 * Stores a bounded ring of tool call records so agents can review
 * their own usage patterns. Extended with acknowledged errors (W1.1)
 * and loop detection (W1.6) for token savings.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for audit trail design
 * @see .kiro/specs/m17-token-wave1/requirements.md for W1.1, W1.6
 */

/** A single audit record for one MCP tool invocation. */
export interface AuditRecord {
  readonly tool: string;
  readonly params: Record<string, unknown>;
  readonly response_tokens: number;
  readonly duration_ms: number;
  readonly timestamp: number;
}

/** Loop detection result. */
export interface LoopDetection {
  readonly tool: string;
  readonly count: number;
  readonly suggestion: string;
}

/** Public API for the audit buffer. */
export interface AuditBuffer {
  /** Record a tool invocation. */
  record(entry: AuditRecord): void;
  /** Query recent audit records. */
  query(limit?: number, since?: number): AuditRecord[];
  /** Total invocations recorded this session. */
  readonly totalInvocations: number;
  /** Mark an error fingerprint as acknowledged (W1.1). */
  acknowledge(fingerprint: string): void;
  /** Check if a fingerprint has been acknowledged. */
  isAcknowledged(fingerprint: string): boolean;
  /** List all acknowledged fingerprints. */
  readonly acknowledgedFingerprints: string[];
  /** Detect if the agent is in a loop (W1.6). Returns null if no loop. */
  detectLoop(): LoopDetection | null;
}

/** Maximum audit records to retain. */
const MAX_AUDIT_RECORDS = 200;
/** Number of identical calls before flagging a loop. */
const LOOP_THRESHOLD = 3;

/**
 * Create an audit buffer for tracking tool invocations.
 *
 * @returns AuditBuffer instance with acknowledge and loop detection.
 */
export function createAuditBuffer(): AuditBuffer {
  const records: AuditRecord[] = [];
  let total = 0;
  const acknowledged = new Set<string>();

  return {
    record(entry: AuditRecord): void {
      records.push(entry);
      total++;
      if (records.length > MAX_AUDIT_RECORDS) {
        records.shift();
      }
    },

    query(limit = 50, since?: number): AuditRecord[] {
      let filtered = since
        ? records.filter((r) => r.timestamp >= since)
        : records;
      filtered = [...filtered].reverse();
      return filtered.slice(0, limit);
    },

    get totalInvocations(): number {
      return total;
    },

    acknowledge(fingerprint: string): void {
      acknowledged.add(fingerprint);
    },

    isAcknowledged(fingerprint: string): boolean {
      return acknowledged.has(fingerprint);
    },

    get acknowledgedFingerprints(): string[] {
      return [...acknowledged];
    },

    detectLoop(): LoopDetection | null {
      if (records.length < LOOP_THRESHOLD) return null;

      // Check last N records for identical (tool, params_hash) tuples
      const recent = records.slice(-LOOP_THRESHOLD);
      const firstKey = `${recent[0].tool}:${JSON.stringify(recent[0].params)}`;

      const allSame = recent.every(
        (r) => `${r.tool}:${JSON.stringify(r.params)}` === firstKey,
      );

      if (!allSame) return null;

      const suggestions: Record<string, string> = {
        get_errors: "Try get_error_context(fingerprint) for a specific error, or clear_errors() to reset.",
        get_build_errors: "Try verify_build() for a comprehensive check, or check the source file directly.",
        watch_for_errors: "Try verify_fix() instead, or increase duration_seconds.",
      };

      return {
        tool: recent[0].tool,
        count: LOOP_THRESHOLD,
        suggestion: suggestions[recent[0].tool] ?? "Consider a different approach or tool.",
      };
    },
  };
}
