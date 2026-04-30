/**
 * Tests for get_error_clusters tool handler.
 */

import { describe, it, expect } from "vitest";
import { handleGetErrorClusters } from "@/tools/get-error-clusters.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    timestamp: Date.now(),
    source: "server-stderr",
    level: "error",
    message: "Test error",
    raw: "Test error",
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    signal_score: 60,
    signal_strength: "high" as const,
    occurrence_count: 1,
    context: {},
    ...overrides,
  };
}

describe("handleGetErrorClusters", () => {
  it("returns empty clusters when no errors", () => {
    const buffer = createRingBuffer(100);
    const result = handleGetErrorClusters(buffer, {});
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.clusters).toEqual([]);
    expect(data.total_clusters).toBe(0);
    expect(data.total_errors).toBe(0);
  });

  it("groups errors by error_type and module path", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ context: { error_type: "TypeError", file: "src/api/users.ts" }, fingerprint: "fp1" }));
    buffer.push(makeEvent({ context: { error_type: "TypeError", file: "src/api/auth.ts" }, fingerprint: "fp2" }));
    buffer.push(makeEvent({ context: { error_type: "ReferenceError", file: "src/api/users.ts" }, fingerprint: "fp3" }));

    const result = handleGetErrorClusters(buffer, { min_count: 1 });
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.total_errors).toBe(3);
    // TypeError|src/api = 2 events, ReferenceError|src/api = 1 event
    const typeErrorCluster = data.clusters.find((c: { error_type: string }) => c.error_type === "TypeError");
    expect(typeErrorCluster).toBeDefined();
    expect(typeErrorCluster.count).toBe(2);
    expect(typeErrorCluster.module_path).toBe("src/api");
  });

  it("filters by min_count", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ context: { error_type: "TypeError", file: "src/api/a.ts" }, fingerprint: "fp1" }));
    buffer.push(makeEvent({ context: { error_type: "TypeError", file: "src/api/b.ts" }, fingerprint: "fp2" }));
    buffer.push(makeEvent({ context: { error_type: "ReferenceError", file: "src/lib/c.ts" }, fingerprint: "fp3" }));

    const result = handleGetErrorClusters(buffer, { min_count: 2 });
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.total_clusters).toBe(1);
    expect(data.clusters[0].error_type).toBe("TypeError");
  });

  it("sorts clusters by count descending", () => {
    const buffer = createRingBuffer(100);
    // 3 TypeErrors in src/api
    buffer.push(makeEvent({ context: { error_type: "TypeError", file: "src/api/a.ts" }, fingerprint: "fp1" }));
    buffer.push(makeEvent({ context: { error_type: "TypeError", file: "src/api/b.ts" }, fingerprint: "fp2" }));
    buffer.push(makeEvent({ context: { error_type: "TypeError", file: "src/api/c.ts" }, fingerprint: "fp3" }));
    // 2 ReferenceErrors in src/lib
    buffer.push(makeEvent({ context: { error_type: "ReferenceError", file: "src/lib/d.ts" }, fingerprint: "fp4" }));
    buffer.push(makeEvent({ context: { error_type: "ReferenceError", file: "src/lib/e.ts" }, fingerprint: "fp5" }));

    const result = handleGetErrorClusters(buffer, { min_count: 1 });
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.clusters[0].count).toBe(3);
    expect(data.clusters[1].count).toBe(2);
  });

  it("handles events without file context", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ context: { error_type: "Error" }, fingerprint: "fp1" }));
    buffer.push(makeEvent({ context: { error_type: "Error" }, fingerprint: "fp2" }));

    const result = handleGetErrorClusters(buffer, { min_count: 1 });
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.clusters[0].module_path).toBe("unknown");
    expect(data.clusters[0].count).toBe(2);
  });

  it("deduplicates fingerprints in cluster", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ context: { error_type: "TypeError", file: "src/api/a.ts" }, fingerprint: "fp-same" }));
    // Same fingerprint won't create a new event (dedup in buffer), but different one will
    buffer.push(makeEvent({ context: { error_type: "TypeError", file: "src/api/b.ts" }, fingerprint: "fp-other" }));

    const result = handleGetErrorClusters(buffer, { min_count: 1 });
    const data = JSON.parse((result.content[0] as { text: string }).text);

    const cluster = data.clusters.find((c: { error_type: string }) => c.error_type === "TypeError");
    expect(cluster.fingerprints.length).toBe(2);
    expect(new Set(cluster.fingerprints).size).toBe(2);
  });
});
