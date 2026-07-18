/**
 * End-to-end proof that tool handlers fire the lifecycle FSM episode hooks:
 * a real get_errors call advances a fingerprint first_seen → surfaced, and a
 * subsequent get_error_context / acknowledge_error advances it → investigated.
 *
 * Without this wiring the FSM never leaves first_seen and lifecycle_metrics is
 * all-zeros (see docs/research/telemetry-savings-measurement.md).
 *
 * @see src/mcp/server.ts (handler → lifecycleHooks wiring)
 * @see TRP-79
 */

import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/mcp/server.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createLifecycleFSM } from "@/store/lifecycle-fsm.js";
import { createLifecycleHooks } from "@/store/lifecycle-hooks.js";
import { makeEvent } from "../helpers/make-event.js";

async function connect(server: Awaited<ReturnType<typeof createMcpServer>>) {
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("lifecycle hooks wiring (end-to-end)", () => {
  it("get_errors surfaces fingerprints and get_error_context investigates them", async () => {
    const buffer = createRingBuffer();
    const lifecycleFsm = createLifecycleFSM();
    const lifecycleHooks = createLifecycleHooks(lifecycleFsm);

    const fp = "fp-lifecycle-1";
    buffer.push(makeEvent({ level: "error", fingerprint: fp, signal_score: 80 }));

    const server = createMcpServer(buffer, () => true, { lifecycleFsm, lifecycleHooks });
    const client = await connect(server);

    // Before any tool call, the fingerprint sits in first_seen.
    expect(lifecycleFsm.getState(fp)).toBe("first_seen");

    await client.callTool({ name: "get_errors", arguments: {} });
    expect(lifecycleFsm.getState(fp)).toBe("surfaced");

    await client.callTool({ name: "get_error_context", arguments: { fingerprint: fp } });
    expect(lifecycleFsm.getState(fp)).toBe("investigated");

    await client.close();
    await server.close();
  });

  it("acknowledge_error advances a surfaced fingerprint to investigated", async () => {
    const buffer = createRingBuffer();
    const lifecycleFsm = createLifecycleFSM();
    const lifecycleHooks = createLifecycleHooks(lifecycleFsm);

    const fp = "fp-lifecycle-2";
    buffer.push(makeEvent({ level: "error", fingerprint: fp, signal_score: 80 }));

    const server = createMcpServer(buffer, () => true, { lifecycleFsm, lifecycleHooks });
    const client = await connect(server);

    await client.callTool({ name: "get_errors", arguments: {} });
    expect(lifecycleFsm.getState(fp)).toBe("surfaced");

    await client.callTool({ name: "acknowledge_error", arguments: { fingerprint: fp } });
    expect(lifecycleFsm.getState(fp)).toBe("investigated");

    await client.close();
    await server.close();
  });
});
