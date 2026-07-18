/**
 * End-to-end: get_effectiveness_report is registered and returns a valid measured report.
 *
 * @see src/tools/get-effectiveness-report.ts
 * @see TRP-84
 */

import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/mcp/server.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createLifecycleFSM } from "@/store/lifecycle-fsm.js";

describe("get_effectiveness_report (end-to-end)", () => {
  it("is registered and returns a measured, version-stamped report", async () => {
    const buffer = createRingBuffer();
    const lifecycleFsm = createLifecycleFSM();
    const server = createMcpServer(buffer, () => true, { lifecycleFsm });

    const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);

    const res = await client.callTool({ name: "get_effectiveness_report", arguments: {} });
    const report = JSON.parse((res.content as Array<{ text: string }>)[0].text);

    expect(report.provenance).toContain("measured");
    expect(typeof report.tp_version).toBe("string");
    expect(report.total_episodes).toBe(0);
    // Rate shape: {value, n, ci_low, ci_high}
    expect(report.confirmed_fix_rate).toHaveProperty("value");
    expect(report.confirmed_fix_rate).toHaveProperty("n");
    expect(report.confirmed_fix_rate).toHaveProperty("ci_low");
    expect(report.confirmed_fix_rate).toHaveProperty("ci_high");

    await client.close();
    await server.close();
  });
});
