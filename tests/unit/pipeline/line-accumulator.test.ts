/**
 * Unit tests for multi-line accumulator.
 *
 * @see src/pipeline/line-accumulator.ts
 */

import { describe, it, expect } from "vitest";
import { createLineAccumulator } from "@/pipeline/line-accumulator.js";

describe("line accumulator", () => {
  it("emits single lines immediately", () => {
    const emitted: string[] = [];
    const feed = createLineAccumulator((line) => emitted.push(line));

    feed("GET /api/users 200");
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toBe("GET /api/users 200");
  });

  it("joins Python traceback into single block", () => {
    const emitted: string[] = [];
    const feed = createLineAccumulator((line) => emitted.push(line));

    feed("Traceback (most recent call last):");
    feed('  File "activity.py", line 50, in get_activity');
    feed("    result = entity.get('name')");
    feed("AttributeError: 'EntityMeta' object has no attribute 'get'");

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toContain("Traceback (most recent call last):");
    expect(emitted[0]).toContain('File "activity.py", line 50');
    expect(emitted[0]).toContain("AttributeError");
  });

  it("flushes previous block when new block starts", () => {
    const emitted: string[] = [];
    const feed = createLineAccumulator((line) => emitted.push(line));

    feed("Traceback (most recent call last):");
    feed('  File "a.py", line 1, in f');
    feed("ValueError: bad");
    // First block flushed

    feed("normal line");
    expect(emitted).toHaveLength(2);
  });

  it("emits non-block lines between blocks", () => {
    const emitted: string[] = [];
    const feed = createLineAccumulator((line) => emitted.push(line));

    feed("INFO: server started");
    feed("GET /api/users 200");
    expect(emitted).toHaveLength(2);
  });
});
