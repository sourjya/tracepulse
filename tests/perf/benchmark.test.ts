/**
 * Performance benchmark for TracePulse pipeline.
 *
 * Measures: parser throughput, buffer operations, tool response time.
 * Run: npx vitest run tests/perf/benchmark.test.ts
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createDefaultRegistry } from "@/pipeline/parser-registry.js";
import { redact } from "@/pipeline/secret-redactor.js";
import { normalizeRawLine } from "@/pipeline/event-normalizer.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(i: number): RuntimeEvent {
  return {
    id: `id-${i}`, timestamp: Date.now(), source: "server-stderr",
    service: "main", level: "error", message: `Error ${i}`,
    fingerprint: `fp:${i}`, signal_score: 50, signal_strength: "high",
    context: {}, raw: `Error ${i}`, first_seen: Date.now(), occurrence_count: 1,
  };
}

describe("performance benchmarks", () => {
  it("parser registry: 20 parsers x 10,000 lines", () => {
    const registry = createDefaultRegistry();
    const lines = [
      'GET /api/users 200 15ms',
      'TypeError: Cannot read property "id" of undefined',
      '{"level":"error","msg":"connection failed"}',
      '[error] database timeout exceeded',
      'INFO: 127.0.0.1 - "GET /api/health HTTP/1.1" 200',
      'FAILED tests/test_auth.py::test_login',
      'src/auth.ts(42,5): error TS2345: Argument mismatch',
      'Server listening on port 3000',
      'GET /api/products 404 2ms',
      'Running upgrade abc123 -> def456',
    ];

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      registry.parse(lines[i % lines.length]);
    }
    const elapsed = performance.now() - start;

    console.log(`Parser registry: 10,000 lines in ${elapsed.toFixed(1)}ms (${(10000 / elapsed * 1000).toFixed(0)} lines/sec)`);
    expect(elapsed).toBeLessThan(1000); // should be well under 1s
  });

  it("secret redaction: 10,000 lines", () => {
    const lines = [
      'Connecting to postgresql://user:password123@localhost:5432/db',
      'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
      'API_KEY=sk-1234567890abcdef connecting',
      'Normal log line without secrets',
      'GET /api/users 200 15ms',
    ];

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      redact(lines[i % lines.length]);
    }
    const elapsed = performance.now() - start;

    console.log(`Secret redaction: 10,000 lines in ${elapsed.toFixed(1)}ms (${(10000 / elapsed * 1000).toFixed(0)} lines/sec)`);
    expect(elapsed).toBeLessThan(500);
  });

  it("ring buffer: push 500 events + query", () => {
    const buffer = createRingBuffer(500);

    const pushStart = performance.now();
    for (let i = 0; i < 500; i++) {
      buffer.push(makeEvent(i));
    }
    const pushElapsed = performance.now() - pushStart;

    const queryStart = performance.now();
    for (let i = 0; i < 100; i++) {
      buffer.query({ level: "error" });
    }
    const queryElapsed = performance.now() - queryStart;

    console.log(`Buffer push: 500 events in ${pushElapsed.toFixed(1)}ms`);
    console.log(`Buffer query: 100 queries in ${queryElapsed.toFixed(1)}ms (${(queryElapsed / 100).toFixed(2)}ms/query)`);
    expect(pushElapsed).toBeLessThan(100);
    expect(queryElapsed).toBeLessThan(500);
  });

  it("full pipeline: 1,000 lines end-to-end", () => {
    const registry = createDefaultRegistry();
    const buffer = createRingBuffer(500);
    const line = 'INFO: 127.0.0.1 - "GET /api/users HTTP/1.1" 200';

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const redacted = redact(line);
      const parsed = registry.parse(redacted);
      const event = parsed
        ? normalizeRawLine(redacted, "server-stdout")
        : normalizeRawLine(redacted, "server-stdout");
      buffer.push(event);
    }
    const elapsed = performance.now() - start;

    console.log(`Full pipeline: 1,000 lines in ${elapsed.toFixed(1)}ms (${(1000 / elapsed * 1000).toFixed(0)} lines/sec)`);
    expect(elapsed).toBeLessThan(2000);
  });
});
