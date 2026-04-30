/**
 * Tests for audit buffer and get_audit_trail tool handler.
 */

import { describe, it, expect } from "vitest";
import { createAuditBuffer } from "@/store/audit-buffer.js";
import { handleGetAuditTrail } from "@/tools/get-audit-trail.js";

describe("createAuditBuffer", () => {
  it("records and queries entries", () => {
    const buf = createAuditBuffer();
    buf.record({ tool: "get_errors", params: { limit: 5 }, response_tokens: 1000, duration_ms: 3, timestamp: 100 });
    buf.record({ tool: "get_build_errors", params: {}, response_tokens: 500, duration_ms: 1, timestamp: 200 });

    const records = buf.query();
    expect(records.length).toBe(2);
    // Newest first
    expect(records[0].tool).toBe("get_build_errors");
    expect(records[1].tool).toBe("get_errors");
  });

  it("respects limit", () => {
    const buf = createAuditBuffer();
    for (let i = 0; i < 10; i++) {
      buf.record({ tool: `tool_${i}`, params: {}, response_tokens: 100, duration_ms: 1, timestamp: i });
    }
    expect(buf.query(3).length).toBe(3);
  });

  it("filters by since", () => {
    const buf = createAuditBuffer();
    buf.record({ tool: "old", params: {}, response_tokens: 100, duration_ms: 1, timestamp: 100 });
    buf.record({ tool: "new", params: {}, response_tokens: 100, duration_ms: 1, timestamp: 200 });

    const records = buf.query(50, 150);
    expect(records.length).toBe(1);
    expect(records[0].tool).toBe("new");
  });

  it("evicts oldest when over 200", () => {
    const buf = createAuditBuffer();
    for (let i = 0; i < 210; i++) {
      buf.record({ tool: `tool_${i}`, params: {}, response_tokens: 100, duration_ms: 1, timestamp: i });
    }
    expect(buf.query(300).length).toBe(200);
    expect(buf.totalInvocations).toBe(210);
  });
});

describe("handleGetAuditTrail", () => {
  it("returns audit records", () => {
    const buf = createAuditBuffer();
    buf.record({ tool: "get_errors", params: { limit: 5 }, response_tokens: 1000, duration_ms: 3, timestamp: Date.now() });

    const result = handleGetAuditTrail(buf, {});
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.actions.length).toBe(1);
    expect(data.total_session_invocations).toBe(1);
    expect(data.actions[0].tool).toBe("get_errors");
  });

  it("returns empty when no invocations", () => {
    const buf = createAuditBuffer();
    const result = handleGetAuditTrail(buf, {});
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.actions).toEqual([]);
    expect(data.total_session_invocations).toBe(0);
  });
});
