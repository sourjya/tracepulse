/**
 * Tests for tool-call telemetry middleware.
 *
 * @see src/mcp/tool-telemetry.ts
 * @see TRP-78
 */

import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { instrumentHandler, estimateResponseTokens } from "@/mcp/tool-telemetry.js";
import { createAuditBuffer } from "@/store/audit-buffer.js";

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

describe("estimateResponseTokens", () => {
  it("estimates ~4 chars per token from text content", () => {
    expect(estimateResponseTokens(textResult("12345678"))).toBe(2); // 8 chars / 4
  });

  it("returns 0 for missing/empty content", () => {
    expect(estimateResponseTokens(undefined)).toBe(0);
    expect(estimateResponseTokens({ content: [] })).toBe(0);
  });
});

describe("instrumentHandler", () => {
  it("records the call to the audit buffer and preserves the result", async () => {
    const auditBuffer = createAuditBuffer();
    const handler = (_args: Record<string, unknown>) => textResult("hello world");

    const wrapped = instrumentHandler("get_errors", handler, { auditBuffer });
    const result = await wrapped({ foo: "bar" });

    expect(result).toEqual(textResult("hello world"));
    expect(auditBuffer.totalInvocations).toBe(1);

    const [rec] = auditBuffer.query(1);
    expect(rec.tool).toBe("get_errors");
    expect(rec.params).toEqual({ foo: "bar" });
    expect(rec.response_tokens).toBe(estimateResponseTokens(textResult("hello world")));
  });

  it("calls journalToolCall on the journal bridge when provided", async () => {
    const auditBuffer = createAuditBuffer();
    const journaled: string[] = [];
    const journalBridge = { journalToolCall: (tool: string) => { journaled.push(tool); } };

    const wrapped = instrumentHandler("run_and_watch", () => textResult("ok"), { auditBuffer, journalBridge });
    await wrapped({});

    expect(journaled).toEqual(["run_and_watch"]);
  });

  it("records a positive duration using the injected clock", async () => {
    const auditBuffer = createAuditBuffer();
    let t = 1000;
    const clock = () => t;
    const wrapped = instrumentHandler("verify_build", () => { t = 1042; return textResult("x"); }, { auditBuffer }, clock);

    await wrapped({});
    const [rec] = auditBuffer.query(1);
    expect(rec.duration_ms).toBe(42);
    expect(rec.timestamp).toBe(1000);
  });

  it("does not swallow handler errors (a failed call is not recorded)", async () => {
    const auditBuffer = createAuditBuffer();
    const wrapped = instrumentHandler("boom", () => { throw new Error("kaboom"); }, { auditBuffer });

    await expect(wrapped({})).rejects.toThrow("kaboom");
    expect(auditBuffer.totalInvocations).toBe(0);
  });

  it("still returns the result if a telemetry sink throws", async () => {
    const auditBuffer = createAuditBuffer();
    const journalBridge = { journalToolCall: () => { throw new Error("sink down"); } };
    const wrapped = instrumentHandler("get_errors", () => textResult("safe"), { auditBuffer, journalBridge });

    await expect(wrapped({})).resolves.toEqual(textResult("safe"));
  });
});
