/**
 * Tests for file filter on get_errors.
 *
 * @see src/mcp/server.ts handleGetErrors
 */

import { describe, it, expect } from "vitest";
import { handleGetErrors } from "@/mcp/server.js";
import { createRingBuffer } from "@/store/ring-buffer.js";

describe("get_errors file filter", () => {
  it("filters errors by file path", () => {
    const buffer = createRingBuffer();
    buffer.push({
      id: "1", timestamp: Date.now(), source: "server-stderr", service: "main",
      level: "error", message: "Error in app.ts", fingerprint: "fp1",
      signal_score: 50, signal_strength: "high",
      context: { file: "src/app.ts", line: 10 }, raw: "err", first_seen: Date.now(), occurrence_count: 1,
    });
    buffer.push({
      id: "2", timestamp: Date.now(), source: "server-stderr", service: "main",
      level: "error", message: "Error in utils.ts", fingerprint: "fp2",
      signal_score: 40, signal_strength: "medium",
      context: { file: "src/utils.ts", line: 5 }, raw: "err", first_seen: Date.now(), occurrence_count: 1,
    });

    const result = handleGetErrors(buffer, { file: "src/app.ts" });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].context.file).toBe("src/app.ts");
  });

  it("returns all errors when no file filter", () => {
    const buffer = createRingBuffer();
    buffer.push({
      id: "1", timestamp: Date.now(), source: "server-stderr", service: "main",
      level: "error", message: "Error 1", fingerprint: "fp1",
      signal_score: 50, signal_strength: "high",
      context: { file: "a.ts" }, raw: "err", first_seen: Date.now(), occurrence_count: 1,
    });
    buffer.push({
      id: "2", timestamp: Date.now(), source: "server-stderr", service: "main",
      level: "error", message: "Error 2", fingerprint: "fp2",
      signal_score: 40, signal_strength: "medium",
      context: { file: "b.ts" }, raw: "err", first_seen: Date.now(), occurrence_count: 1,
    });

    const result = handleGetErrors(buffer, {});
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.errors).toHaveLength(2);
  });
});
