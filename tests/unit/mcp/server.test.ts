/**
 * Unit tests for MCP server tool handlers.
 *
 * Tests the pure handler functions (handleGetErrors, handleGetServerLogs,
 * handleGetRuntimeStatus, handleClearErrors) that back the MCP tools.
 * Each handler reads from an EventBuffer and returns a CallToolResult.
 * Transport-level MCP behavior is NOT tested here — only the data logic.
 *
 * @see src/mcp/server.ts for implementation
 * @see src/types/collectors.ts for the EventBuffer interface
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createMcpServer,
  handleGetErrors,
  handleGetServerLogs,
  handleGetRuntimeStatus,
  handleClearErrors,
} from "@/mcp/server";
import { createRingBuffer } from "@/store/ring-buffer";
import type { RuntimeEvent, EventSource, LogLevel } from "@/types/events";
import type { EventBuffer } from "@/types/collectors";

// ──────────────────────────────────────────────
// Test Helper
// ──────────────────────────────────────────────

let eventCounter = 0;

/**
 * Create a valid RuntimeEvent with sensible defaults.
 * Every call produces a unique id and fingerprint unless overridden.
 */
function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  eventCounter++;
  return {
    id: `evt-${eventCounter}`,
    timestamp: Date.now(),
    source: "server-stderr" as EventSource,
    service: "main",
    level: "error" as LogLevel,
    message: `Test error ${eventCounter}`,
    fingerprint: `fp-${eventCounter}`,
    signal_score: 75,
    signal_strength: "high",
    context: {},
    raw: `raw log line ${eventCounter}`,
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

/**
 * Parse the JSON text from a CallToolResult's first content block.
 * Handlers always return a single text content block with JSON.
 */
function parseResult(result: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

// ──────────────────────────────────────────────
// createMcpServer
// ──────────────────────────────────────────────

describe("createMcpServer", () => {
  it("returns an McpServer instance", () => {
    const buffer = createRingBuffer(10);
    const server = createMcpServer(buffer, () => true);
    // McpServer has a .server property (the underlying Server) and .connect method
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
  });
});

// ──────────────────────────────────────────────
// handleGetErrors
// ──────────────────────────────────────────────

describe("handleGetErrors", () => {
  let buffer: EventBuffer;

  beforeEach(() => {
    eventCounter = 0;
    buffer = createRingBuffer(100);
  });

  it("returns error/warn events sorted by signal_score descending", () => {
    buffer.push(makeEvent({ level: "error", signal_score: 30 }));
    buffer.push(makeEvent({ level: "warn", signal_score: 90 }));
    buffer.push(makeEvent({ level: "error", signal_score: 60 }));

    const result = handleGetErrors(buffer, {});
    const data = parseResult(result) as { errors: RuntimeEvent[] };

    expect(data.errors).toHaveLength(3);
    expect(data.errors[0].signal_score).toBe(90);
    expect(data.errors[1].signal_score).toBe(60);
    expect(data.errors[2].signal_score).toBe(30);
  });

  it("filters by since timestamp", () => {
    buffer.push(makeEvent({ level: "error", timestamp: 1000 }));
    buffer.push(makeEvent({ level: "error", timestamp: 3000 }));

    const result = handleGetErrors(buffer, { since: 2000 });
    const data = parseResult(result) as { errors: RuntimeEvent[] };

    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].timestamp).toBe(3000);
  });

  it("filters by source", () => {
    buffer.push(makeEvent({ level: "error", source: "server-stdout" as EventSource }));
    buffer.push(makeEvent({ level: "error", source: "server-stderr" as EventSource }));

    const result = handleGetErrors(buffer, { source: "server-stderr" });
    const data = parseResult(result) as { errors: RuntimeEvent[] };

    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].source).toBe("server-stderr");
  });

  it("applies default limit of 20", () => {
    for (let i = 0; i < 25; i++) {
      buffer.push(makeEvent({ level: "error" }));
    }

    const result = handleGetErrors(buffer, {});
    const data = parseResult(result) as { errors: RuntimeEvent[] };

    expect(data.errors).toHaveLength(20);
  });

  it("respects explicit limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      buffer.push(makeEvent({ level: "error" }));
    }

    const result = handleGetErrors(buffer, { limit: 3 });
    const data = parseResult(result) as { errors: RuntimeEvent[] };

    expect(data.errors).toHaveLength(3);
  });

  it("returns empty errors array when no errors exist", () => {
    const result = handleGetErrors(buffer, {});
    const data = parseResult(result) as { errors: RuntimeEvent[]; session_started_at: number };

    expect(data.errors).toEqual([]);
    expect(data.session_started_at).toBeGreaterThan(0);
  });

  it("excludes info and debug events", () => {
    buffer.push(makeEvent({ level: "error" }));
    buffer.push(makeEvent({ level: "warn" }));
    buffer.push(makeEvent({ level: "info" }));
    buffer.push(makeEvent({ level: "debug" }));

    const result = handleGetErrors(buffer, {});
    const data = parseResult(result) as { errors: RuntimeEvent[] };

    expect(data.errors).toHaveLength(2);
    const levels = data.errors.map((e) => e.level);
    expect(levels).toContain("error");
    expect(levels).toContain("warn");
    expect(levels).not.toContain("info");
    expect(levels).not.toContain("debug");
  });

  it("returns error result for invalid source param", () => {
    const result = handleGetErrors(buffer, { source: "invalid-source" });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("source");
  });

  it("returns error result for invalid limit param", () => {
    const result = handleGetErrors(buffer, { limit: -5 });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("limit");
  });
});

// ──────────────────────────────────────────────
// handleGetServerLogs
// ──────────────────────────────────────────────

describe("handleGetServerLogs", () => {
  let buffer: EventBuffer;

  beforeEach(() => {
    eventCounter = 0;
    buffer = createRingBuffer(100);
  });

  it("returns all levels sorted by timestamp descending", () => {
    buffer.push(makeEvent({ level: "error", timestamp: 1000 }));
    buffer.push(makeEvent({ level: "info", timestamp: 3000 }));
    buffer.push(makeEvent({ level: "debug", timestamp: 2000 }));

    const result = handleGetServerLogs(buffer, {});
    const events = parseResult(result) as RuntimeEvent[];

    expect(events).toHaveLength(3);
    expect(events[0].timestamp).toBe(3000);
    expect(events[1].timestamp).toBe(2000);
    expect(events[2].timestamp).toBe(1000);
  });

  it("filters by minimum level", () => {
    buffer.push(makeEvent({ level: "error" }));
    buffer.push(makeEvent({ level: "warn" }));
    buffer.push(makeEvent({ level: "info" }));
    buffer.push(makeEvent({ level: "debug" }));

    const result = handleGetServerLogs(buffer, { level: "warn" });
    const events = parseResult(result) as RuntimeEvent[];

    expect(events).toHaveLength(2);
    const levels = events.map((e) => e.level);
    expect(levels).toContain("error");
    expect(levels).toContain("warn");
  });

  it("applies default limit of 50", () => {
    for (let i = 0; i < 60; i++) {
      buffer.push(makeEvent({ level: "info", timestamp: 1000 + i }));
    }

    const result = handleGetServerLogs(buffer, {});
    const events = parseResult(result) as RuntimeEvent[];

    expect(events).toHaveLength(50);
  });

  it("respects explicit limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      buffer.push(makeEvent({ level: "info" }));
    }

    const result = handleGetServerLogs(buffer, { limit: 5 });
    const events = parseResult(result) as RuntimeEvent[];

    expect(events).toHaveLength(5);
  });

  it("returns error result for invalid level param", () => {
    const result = handleGetServerLogs(buffer, { level: "critical" });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("level");
  });
});

// ──────────────────────────────────────────────
// handleGetRuntimeStatus
// ──────────────────────────────────────────────

describe("handleGetRuntimeStatus", () => {
  let buffer: EventBuffer;

  beforeEach(() => {
    eventCounter = 0;
    buffer = createRingBuffer(100);
  });

  it("returns correct connected, error_count, and last_error_time", () => {
    buffer.push(makeEvent({ level: "error", timestamp: 1000 }));
    buffer.push(makeEvent({ level: "error", timestamp: 3000 }));
    buffer.push(makeEvent({ level: "info", timestamp: 5000 }));

    const result = handleGetRuntimeStatus(buffer, () => true);
    const status = parseResult(result) as {
      connected: boolean;
      error_count: number;
      last_error_time: number | null;
    };

    expect(status.connected).toBe(true);
    expect(status.error_count).toBe(2);
    expect(status.last_error_time).toBe(3000);
  });

  it("returns last_error_time: null when no errors exist", () => {
    buffer.push(makeEvent({ level: "info" }));

    const result = handleGetRuntimeStatus(buffer, () => false);
    const status = parseResult(result) as {
      connected: boolean;
      error_count: number;
      last_error_time: number | null;
    };

    expect(status.connected).toBe(false);
    expect(status.error_count).toBe(0);
    expect(status.last_error_time).toBeNull();
  });
});

// ──────────────────────────────────────────────
// handleClearErrors
// ──────────────────────────────────────────────

describe("handleClearErrors", () => {
  let buffer: EventBuffer;

  beforeEach(() => {
    eventCounter = 0;
    buffer = createRingBuffer(100);
  });

  it("returns cleared_count and empties buffer", () => {
    buffer.push(makeEvent());
    buffer.push(makeEvent());
    buffer.push(makeEvent());

    const result = handleClearErrors(buffer);
    const data = parseResult(result) as { cleared_count: number };

    expect(data.cleared_count).toBe(3);
    expect(buffer.size).toBe(0);
  });

  it("returns cleared_count: 0 on empty buffer", () => {
    const result = handleClearErrors(buffer);
    const data = parseResult(result) as { cleared_count: number };

    expect(data.cleared_count).toBe(0);
  });
});
