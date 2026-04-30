/**
 * Tests for perf baseline tracker and get_perf_baseline tool handler.
 */

import { describe, it, expect } from "vitest";
import { createPerfBaseline } from "@/store/perf-baseline.js";
import { handleGetPerfBaseline } from "@/tools/get-perf-baseline.js";

describe("createPerfBaseline", () => {
  it("records and retrieves endpoint metrics", () => {
    const pb = createPerfBaseline();
    pb.record("/api/users", 100);
    pb.record("/api/users", 200);
    pb.record("/api/users", 300);

    const metrics = pb.getByPath("/api/users");
    expect(metrics).not.toBeNull();
    expect(metrics!.request_count).toBe(3);
    expect(metrics!.p50_ms).toBe(200);
    expect(metrics!.max_ms).toBe(300);
  });

  it("computes P95 correctly", () => {
    const pb = createPerfBaseline();
    for (let i = 1; i <= 100; i++) {
      pb.record("/api/data", i * 10);
    }
    const metrics = pb.getByPath("/api/data");
    expect(metrics!.p95_ms).toBe(950);
  });

  it("counts slow requests", () => {
    const pb = createPerfBaseline();
    pb.record("/api/slow", 500);
    pb.record("/api/slow", 1500);
    pb.record("/api/slow", 2000);

    const metrics = pb.getByPath("/api/slow");
    expect(metrics!.slow_count).toBe(2);
  });

  it("returns null for unknown path", () => {
    const pb = createPerfBaseline();
    expect(pb.getByPath("/unknown")).toBeNull();
  });

  it("sorts getAll by request count descending", () => {
    const pb = createPerfBaseline();
    pb.record("/api/a", 100);
    pb.record("/api/b", 100);
    pb.record("/api/b", 200);
    pb.record("/api/c", 100);
    pb.record("/api/c", 200);
    pb.record("/api/c", 300);

    const all = pb.getAll();
    expect(all[0].path).toBe("/api/c");
    expect(all[1].path).toBe("/api/b");
    expect(all[2].path).toBe("/api/a");
  });

  it("evicts oldest samples when over 100", () => {
    const pb = createPerfBaseline();
    for (let i = 0; i < 110; i++) {
      pb.record("/api/test", i);
    }
    const metrics = pb.getByPath("/api/test");
    expect(metrics!.request_count).toBe(100);
  });
});

describe("handleGetPerfBaseline", () => {
  it("returns all endpoints", () => {
    const pb = createPerfBaseline();
    pb.record("/api/users", 100);
    pb.record("/api/posts", 200);

    const result = handleGetPerfBaseline(pb, {});
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.endpoints.length).toBe(2);
  });

  it("filters by path", () => {
    const pb = createPerfBaseline();
    pb.record("/api/users", 100);
    pb.record("/api/posts", 200);

    const result = handleGetPerfBaseline(pb, { path: "/api/users" });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.endpoints.length).toBe(1);
    expect(data.endpoints[0].path).toBe("/api/users");
  });

  it("returns error for unknown path", () => {
    const pb = createPerfBaseline();
    const result = handleGetPerfBaseline(pb, { path: "/unknown" });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.error).toContain("No data");
  });
});
