/**
 * Integration tests for MCP tool handlers against a pre-populated buffer.
 *
 * Pushes realistic RuntimeEvents into a real ring buffer, then calls the
 * pure handler functions (handleGetErrors, handleGetServerLogs,
 * handleGetRuntimeStatus, handleClearErrors) and verifies response format,
 * sorting, and state mutations.
 *
 * @see src/mcp/server.ts for handler implementations
 * @see src/store/ring-buffer.ts for EventBuffer
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  handleGetErrors,
  handleGetServerLogs,
  handleGetRuntimeStatus,
  handleClearErrors,
} from "@/mcp/server";
import { createRingBuffer } from "@/store/ring-buffer";
import type { EventBuffer } from "@/types/collectors";
import type { RuntimeEvent } from "@/types/events";

// ──────────────────────────────────────────────
// Test Helpers
// ──────────────────────────────────────────────

let counter = 0;

/**
 * Create a RuntimeEvent with sensible defaults and unique identity.
 * Overrides allow customizing any field for specific test scenarios.
 */
function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  counter++;
  return {
    id: `evt-${counter}`,
    timestamp: Date.now() - (100 - counter) * 1000,
    source: "server-stderr",
    service: "main",
    level: "error",
    message: `Error ${counter}`,
    fingerprint: `fp-${counter}`,
    signal_score: 50 + counter,
    signal_strength: "high",
    context: {},
    raw: `raw ${counter}`,
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

/**
 * Parse JSON from a CallToolResult's first text content block.
 */
function parseResult(result: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

let buffer: EventBuffer;

beforeEach(() => {
  counter = 0;
  buffer = createRingBuffer();
});

// ──────────────────────────────────────────────
// get_errors
// ──────────────────────────────────────────────

describe("handleGetErrors", () => {
  it("returns events sorted by signal_score descending", () => {
    buffer.push(makeEvent({ signal_score: 30, level: "warn", signal_strength: "medium" }));
    buffer.push(makeEvent({ signal_score: 90, level: "error", signal_strength: "high" }));
    buffer.push(makeEvent({ signal_score: 60, level: "error", signal_strength: "high" }));

    const result = handleGetErrors(buffer, {});
    const data = parseResult(result) as { errors: RuntimeEvent[] };

    expect(data.errors.length).toBe(3);
    expect(data.errors[0].signal_score).toBe(90);
    expect(data.errors[1].signal_score).toBe(60);
    expect(data.errors[2].signal_score).toBe(30);
  });

  it("returns an object with errors array and metadata", () => {
    buffer.push(makeEvent({ level: "error", message: "Test failure" }));

    const result = handleGetErrors(buffer, {});
    const data = parseResult(result) as { errors: RuntimeEvent[]; session_started_at: number };

    expect(data.errors.length).toBe(1);
    expect(data.errors[0]).toHaveProperty("id");
    expect(data.errors[0]).toHaveProperty("timestamp");
    expect(data.errors[0]).toHaveProperty("signal_score");
    expect(data.errors[0]).toHaveProperty("fingerprint");
    expect(data.errors[0].message).toBe("Test failure");
    expect(data.session_started_at).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// get_server_logs
// ──────────────────────────────────────────────

describe("handleGetServerLogs", () => {
  it("returns events sorted by timestamp descending (newest first)", () => {
    const now = Date.now();
    buffer.push(makeEvent({ timestamp: now - 3000, level: "info" }));
    buffer.push(makeEvent({ timestamp: now - 1000, level: "info" }));
    buffer.push(makeEvent({ timestamp: now - 2000, level: "info" }));

    const result = handleGetServerLogs(buffer, {});
    const events = parseResult(result) as RuntimeEvent[];

    expect(events.length).toBe(3);
    // Newest first
    expect(events[0].timestamp).toBe(now - 1000);
    expect(events[1].timestamp).toBe(now - 2000);
    expect(events[2].timestamp).toBe(now - 3000);
  });

  it("respects the limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      buffer.push(makeEvent({ level: "info" }));
    }

    const result = handleGetServerLogs(buffer, { limit: 3 });
    const events = parseResult(result) as RuntimeEvent[];

    expect(events.length).toBe(3);
  });
});

// ──────────────────────────────────────────────
// get_runtime_status
// ──────────────────────────────────────────────

describe("handleGetRuntimeStatus", () => {
  it("reflects buffer state with error count and connection status", () => {
    buffer.push(makeEvent({ level: "error" }));
    buffer.push(makeEvent({ level: "error" }));
    buffer.push(makeEvent({ level: "info" }));

    const result = handleGetRuntimeStatus(buffer, () => true);
    const status = parseResult(result) as {
      connected: boolean;
      error_count: number;
      last_error_time: number | null;
    };

    expect(status.connected).toBe(true);
    expect(status.error_count).toBe(2);
    expect(status.last_error_time).toBeTypeOf("number");
  });

  it("returns disconnected state when collector is not connected", () => {
    const result = handleGetRuntimeStatus(buffer, () => false);
    const status = parseResult(result) as { connected: boolean; error_count: number };

    expect(status.connected).toBe(false);
    expect(status.error_count).toBe(0);
  });
});

// ──────────────────────────────────────────────
// clear_errors
// ──────────────────────────────────────────────

describe("handleClearErrors", () => {
  it("empties the buffer and returns cleared count", () => {
    buffer.push(makeEvent({ level: "error" }));
    buffer.push(makeEvent({ level: "warn" }));
    buffer.push(makeEvent({ level: "info" }));

    const result = handleClearErrors(buffer);
    const data = parseResult(result) as { cleared_count: number };

    expect(data.cleared_count).toBe(3);
    expect(buffer.size).toBe(0);
  });

  it("returns 0 when buffer is already empty", () => {
    const result = handleClearErrors(buffer);
    const data = parseResult(result) as { cleared_count: number };

    expect(data.cleared_count).toBe(0);
  });
});
