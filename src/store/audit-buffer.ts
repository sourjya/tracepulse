/**
 * Audit buffer for tracking MCP tool invocations.
 *
 * Stores a bounded ring of tool call records so agents can review
 * their own usage patterns. Separate from the event buffer to avoid
 * mixing tool metadata with runtime errors.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for audit trail design
 */

/** A single audit record for one MCP tool invocation. */
export interface AuditRecord {
  readonly tool: string;
  readonly params: Record<string, unknown>;
  readonly response_tokens: number;
  readonly duration_ms: number;
  readonly timestamp: number;
}

/** Public API for the audit buffer. */
export interface AuditBuffer {
  /** Record a tool invocation. */
  record(entry: AuditRecord): void;
  /** Query recent audit records. */
  query(limit?: number, since?: number): AuditRecord[];
  /** Total invocations recorded this session. */
  readonly totalInvocations: number;
}

/** Maximum audit records to retain. */
const MAX_AUDIT_RECORDS = 200;

/**
 * Create an audit buffer for tracking tool invocations.
 *
 * Uses a simple array with shift-on-overflow. 200 records is small
 * enough that O(n) shift is negligible.
 *
 * @returns AuditBuffer instance.
 */
export function createAuditBuffer(): AuditBuffer {
  const records: AuditRecord[] = [];
  let total = 0;

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
      // Newest first
      filtered = [...filtered].reverse();
      return filtered.slice(0, limit);
    },

    get totalInvocations(): number {
      return total;
    },
  };
}
