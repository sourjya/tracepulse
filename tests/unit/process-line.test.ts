/**
 * Tests for shared line processing pipeline.
 *
 * @see src/pipeline/process-line.ts
 */

import { describe, it, expect } from "vitest";
import { processRawLine } from "@/pipeline/process-line.js";
import { createDefaultRegistry } from "@/pipeline/parser-registry.js";

describe("processRawLine", () => {
  const registry = createDefaultRegistry();

  it("strips ANSI codes and returns event", () => {
    const event = processRawLine("\x1b[31mError: test\x1b[0m", "server-stderr", registry);
    expect(event.message).not.toContain("\x1b");
    expect(event.source).toBe("server-stderr");
  });

  it("redacts secrets", () => {
    const event = processRawLine("key=AKIAIOSFODNN7EXAMPLE", "server-stdout", registry);
    expect(event.raw).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("parses Python tracebacks", () => {
    const event = processRawLine('TypeError: cannot unpack non-sequence NoneType', "server-stderr", registry);
    expect(event.level).toBe("error");
  });

  it("returns info for unmatched lines", () => {
    const event = processRawLine("INFO: Server started", "server-stdout", registry);
    expect(event.level).toBe("info");
  });
});
