/**
 * Unit tests for get_new_errors and get_error_trends MCP tools.
 *
 * @see src/tools/get-new-errors.ts
 * @see src/tools/get-error-trends.ts
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createFingerprintHistory } from "@/persistence/fingerprint-history.js";
import { handleGetNewErrors } from "@/tools/get-new-errors.js";
import { handleGetErrorTrends } from "@/tools/get-error-trends.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source: "server-stderr",
    service: "main",
    level: "error",
    message: "test error",
    fingerprint: `fp:${crypto.randomUUID()}`,
    signal_score: 50,
    signal_strength: "high",
    context: {},
    raw: "test error raw",
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

describe("get_new_errors", () => {
  it("returns only events with fingerprints not in history", () => {
    const buffer = createRingBuffer(100);
    const history = createFingerprintHistory();

    const knownFp = "fp:known";
    history.record(knownFp, Date.now());

    buffer.push(makeEvent({ fingerprint: knownFp, level: "error" }));
    buffer.push(makeEvent({ fingerprint: "fp:novel", level: "error" }));

    const result = handleGetNewErrors(buffer, history, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].fingerprint).toBe("fp:novel");
  });

  it("returns empty array when all fingerprints are known", () => {
    const buffer = createRingBuffer(100);
    const history = createFingerprintHistory();

    const fp = "fp:known";
    history.record(fp, Date.now());
    buffer.push(makeEvent({ fingerprint: fp, level: "error" }));

    const result = handleGetNewErrors(buffer, history, {});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toEqual([]);
  });

  it("respects limit parameter", () => {
    const buffer = createRingBuffer(100);
    const history = createFingerprintHistory();

    for (let i = 0; i < 5; i++) {
      buffer.push(makeEvent({ level: "error" }));
    }

    const result = handleGetNewErrors(buffer, history, { limit: 2 });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.errors).toHaveLength(2);
    expect(data.total_new).toBe(5);
  });
});

describe("get_error_trends", () => {
  it("returns correct trend data for known fingerprint", () => {
    const history = createFingerprintHistory();
    history.record("fp:a", 1000);
    history.record("fp:a", 2000);
    history.record("fp:a", 3000);

    const result = handleGetErrorTrends(history, { fingerprint: "fp:a" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.total_occurrences).toBe(3);
    expect(data.first_seen).toBe(1000);
    expect(data.last_seen).toBe(3000);
  });

  it("returns message for unknown fingerprint", () => {
    const history = createFingerprintHistory();
    const result = handleGetErrorTrends(history, { fingerprint: "fp:unknown" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.error).toBeNull();
    expect(data.message).toContain("fp:unknown");
  });

  it("returns error when fingerprint param is missing", () => {
    const history = createFingerprintHistory();
    const result = handleGetErrorTrends(history, {});
    expect(result.isError).toBe(true);
  });
});
