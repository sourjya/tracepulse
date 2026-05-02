/**
 * Tests for M17 Wave 1 token savings features:
 * - Acknowledged errors (W1.1)
 * - Loop detection (W1.6)
 * - No-change delta responses (W1.2)
 * - Stack frame filtering (W1.3)
 * - Message abbreviation (W1.4)
 * - Verbosity parameter (W1.5)
 * - Environmental report (W1.7)
 *
 * @see .kiro/specs/m17-token-wave1/requirements.md
 */

import { describe, it, expect } from "vitest";
import { createAuditBuffer } from "@/store/audit-buffer.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { abbreviateMessage, filterFrameworkFrames } from "@/pipeline/response-compression.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  const now = Date.now();
  return {
    id: crypto.randomUUID(), timestamp: now, source: "server-stderr", service: "main",
    level: "error", message: "Test error", raw: "Test error",
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    signal_score: 60, signal_strength: "high" as const,
    occurrence_count: 1, first_seen: now, context: {},
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// W1.1: Acknowledged Errors
// ──────────────────────────────────────────────

describe("Acknowledged Errors (W1.1)", () => {
  it("acknowledges a fingerprint", () => {
    const audit = createAuditBuffer();
    audit.acknowledge("fp-123");
    expect(audit.isAcknowledged("fp-123")).toBe(true);
  });

  it("does not acknowledge unknown fingerprints", () => {
    const audit = createAuditBuffer();
    expect(audit.isAcknowledged("fp-unknown")).toBe(false);
  });

  it("lists all acknowledged fingerprints", () => {
    const audit = createAuditBuffer();
    audit.acknowledge("fp-1");
    audit.acknowledge("fp-2");
    expect(audit.acknowledgedFingerprints.length).toBe(2);
  });
});

// ──────────────────────────────────────────────
// W1.6: Loop Detection
// ──────────────────────────────────────────────

describe("Loop Detection (W1.6)", () => {
  it("detects 3 identical tool calls", () => {
    const audit = createAuditBuffer();
    for (let i = 0; i < 3; i++) {
      audit.record({ tool: "get_errors", params: { limit: 5 }, response_tokens: 1000, duration_ms: 3, timestamp: Date.now() });
    }
    expect(audit.detectLoop()).not.toBeNull();
    expect(audit.detectLoop()!.tool).toBe("get_errors");
    expect(audit.detectLoop()!.count).toBe(3);
  });

  it("does not flag different tool calls", () => {
    const audit = createAuditBuffer();
    audit.record({ tool: "get_errors", params: { limit: 5 }, response_tokens: 1000, duration_ms: 3, timestamp: Date.now() });
    audit.record({ tool: "get_build_errors", params: {}, response_tokens: 500, duration_ms: 2, timestamp: Date.now() });
    audit.record({ tool: "verify_fix", params: {}, response_tokens: 500, duration_ms: 5000, timestamp: Date.now() });
    expect(audit.detectLoop()).toBeNull();
  });
});

// ──────────────────────────────────────────────
// W1.3: Stack Frame Filtering
// ──────────────────────────────────────────────

describe("Stack Frame Filtering (W1.3)", () => {
  it("strips node_modules frames", () => {
    const stack = `Error: fail
    at UserService.getUser (/app/src/services/user.ts:42:5)
    at node_modules/express/lib/router/layer.js:95:5
    at node_modules/express/lib/router/route.js:144:3
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`;
    const filtered = filterFrameworkFrames(stack);
    expect(filtered).toContain("user.ts:42");
    expect(filtered).not.toContain("node_modules");
    expect(filtered).not.toContain("node:internal");
  });

  it("strips Python site-packages frames", () => {
    const stack = `File "/app/src/handler.py", line 42, in get_user
File "/usr/lib/python3.12/site-packages/fastapi/routing.py", line 200, in run`;
    const filtered = filterFrameworkFrames(stack);
    expect(filtered).toContain("handler.py");
    expect(filtered).not.toContain("site-packages");
  });

  it("returns original if no framework frames", () => {
    const stack = "at myFunc (/app/src/main.ts:10:3)";
    expect(filterFrameworkFrames(stack)).toBe(stack);
  });
});

// ──────────────────────────────────────────────
// W1.4: Message Abbreviation
// ──────────────────────────────────────────────

describe("Message Abbreviation (W1.4)", () => {
  it("abbreviates TypeError null property access", () => {
    const result = abbreviateMessage("TypeError: Cannot read properties of null (reading 'name')");
    expect(result.length).toBeLessThan(60);
    expect(result).toContain("null");
  });

  it("abbreviates ModuleNotFoundError", () => {
    const result = abbreviateMessage("ModuleNotFoundError: No module named 'requests'");
    expect(result).toContain("requests");
    expect(result.length).toBeLessThan(30);
  });

  it("abbreviates ECONNREFUSED", () => {
    const result = abbreviateMessage("Error: connect ECONNREFUSED 127.0.0.1:5432");
    expect(result.length).toBeLessThan(30);
  });

  it("returns original for unknown patterns", () => {
    const msg = "Something completely custom happened";
    expect(abbreviateMessage(msg)).toBe(msg);
  });
});
