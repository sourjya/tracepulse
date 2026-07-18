/**
 * End-to-end proof that the telemetry middleware is wired into tool registration:
 * a real tool call over the MCP protocol records to the audit buffer and journal.
 *
 * Without the TRP-78 wiring, auditBuffer.record is never called on the live path,
 * so get_session_impact / get_audit_trail report zeros.
 *
 * @see src/mcp/server.ts (registerTool middleware)
 * @see TRP-78
 */

import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/mcp/server.js";
import { createAuditBuffer } from "@/store/audit-buffer.js";
import { createRingBuffer } from "@/store/ring-buffer.js";

describe("tool telemetry wiring (end-to-end)", () => {
  it("records a real tool call to the audit buffer and journal", async () => {
    const auditBuffer = createAuditBuffer();
    const journaled: string[] = [];
    const journalBridge = { journalToolCall: (tool: string) => { journaled.push(tool); } };

    const buffer = createRingBuffer();
    const server = createMcpServer(buffer, () => true, { auditBuffer, journalBridge });

    const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    // Before any call, the buffer is empty (this is the bug the wiring fixes).
    expect(auditBuffer.totalInvocations).toBe(0);

    await client.callTool({ name: "get_runtime_status", arguments: {} });

    // After a real protocol-level call, telemetry recorded it.
    expect(auditBuffer.totalInvocations).toBe(1);
    const [rec] = auditBuffer.query(1);
    expect(rec.tool).toBe("get_runtime_status");
    expect(rec.response_tokens).toBeGreaterThan(0);
    expect(journaled).toContain("get_runtime_status");

    await client.close();
    await server.close();
  });
});
