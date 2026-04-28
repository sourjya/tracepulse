/**
 * Integration tests for the full TracePulse pipeline.
 *
 * Exercises the complete flow: raw log line → secret redaction → parser registry
 * → event normalization → signal scoring → ring buffer storage. Uses the real
 * createPipeline factory from cli.ts with a real ring buffer and default parser
 * registry - no mocks.
 *
 * @see src/cli.ts for createPipeline
 * @see src/store/ring-buffer.ts for EventBuffer
 * @see src/pipeline/parser-registry.ts for createDefaultRegistry
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPipeline } from "@/cli";
import { createRingBuffer } from "@/store/ring-buffer";
import { createDefaultRegistry } from "@/pipeline/parser-registry";
import type { EventBuffer } from "@/types/collectors";
import type { ParserRegistry } from "@/pipeline/parser-registry";
import type { RuntimeEvent } from "@/types/events";

// ──────────────────────────────────────────────
// Shared Setup
// ──────────────────────────────────────────────

let buffer: EventBuffer;
let registry: ParserRegistry;
let processLine: (source: "server-stdout" | "server-stderr", rawLine: string) => void;

beforeEach(() => {
  buffer = createRingBuffer();
  registry = createDefaultRegistry();
  processLine = createPipeline(buffer, registry);
});

// ──────────────────────────────────────────────
// Node.js Error Parsing
// ──────────────────────────────────────────────

describe("Node.js error through pipeline", () => {
  it("parses a Node.js error with stack trace into a scored RuntimeEvent", () => {
    const line =
      "TypeError: Cannot read properties of undefined (reading 'id')\n" +
      "    at getUser (/app/src/routes/users.ts:42:15)\n" +
      "    at processTicksAndRejections (node:internal/process/task_queues:95:5)";

    processLine("server-stderr", line);

    const events = buffer.query({});
    expect(events.length).toBe(1);

    const event = events[0];
    expect(event.level).toBe("error");
    expect(event.message).toContain("Cannot read properties of undefined");
    expect(event.source).toBe("server-stderr");
    expect(event.signal_score).toBeGreaterThan(0);
    expect(event.signal_strength).toBeDefined();
    expect(event.fingerprint).toBeTruthy();
    expect(event.occurrence_count).toBe(1);
    expect(event.context.error_type).toBe("TypeError");
  });
});

// ──────────────────────────────────────────────
// Python Traceback Parsing
// ──────────────────────────────────────────────

describe("Python traceback through pipeline", () => {
  it("parses a Python-style error into a RuntimeEvent", () => {
    // Python tracebacks have the exception on the LAST line, frames above
    const line =
      'Traceback (most recent call last):\n' +
      '  File "/app/main.py", line 1, in <module>\n' +
      "ImportError: No module named 'flask'";

    processLine("server-stderr", line);

    const events = buffer.query({});
    expect(events.length).toBe(1);

    const event = events[0];
    expect(event.level).toBe("error");
    expect(event.message).toContain("No module named");
  });
});

// ──────────────────────────────────────────────
// Secret Redaction in Pipeline
// ──────────────────────────────────────────────

describe("secret redaction in pipeline", () => {
  it("redacts secrets before they enter the buffer", () => {
    const secret = "AKIAIOSFODNN7EXAMPLE";
    const line = `Error: Auth failed with key ${secret}`;

    processLine("server-stderr", line);

    const events = buffer.query({});
    expect(events.length).toBe(1);

    const event = events[0];
    expect(event.message).not.toContain(secret);
    expect(event.raw).not.toContain(secret);
    expect(event.message).toContain("[REDACTED]");
  });
});

// ──────────────────────────────────────────────
// Plain Info Lines
// ──────────────────────────────────────────────

describe("unmatched lines become info events", () => {
  it("creates an info-level event for a plain log line", () => {
    processLine("server-stdout", "Server listening on port 3000");

    const events = buffer.query({});
    expect(events.length).toBe(1);

    const event = events[0];
    expect(event.level).toBe("info");
    expect(event.message).toContain("Server listening on port 3000");
    expect(event.source).toBe("server-stdout");
  });
});

// ──────────────────────────────────────────────
// Dedup / Occurrence Counting
// ──────────────────────────────────────────────

describe("dedup and occurrence counting", () => {
  it("increments occurrence_count for duplicate fingerprints", () => {
    const line = "TypeError: Cannot read properties of undefined (reading 'id')";

    processLine("server-stderr", line);
    processLine("server-stderr", line);

    const events = buffer.query({});
    // Dedup means only one event in the buffer
    expect(events.length).toBe(1);
    expect(events[0].occurrence_count).toBe(2);
  });

  it("treats different errors as separate events", () => {
    processLine("server-stderr", "TypeError: foo is not a function");
    processLine("server-stderr", "RangeError: Maximum call stack size exceeded");

    const events = buffer.query({});
    expect(events.length).toBe(2);
    expect(events[0].occurrence_count).toBe(1);
    expect(events[1].occurrence_count).toBe(1);
  });
});
