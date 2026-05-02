/**
 * Tests for compact field name response mode.
 *
 * Renames verbose fields to short keys for token savings.
 *
 * @see src/pipeline/compact-fields.ts for implementation
 */

import { describe, it, expect } from "vitest";
import { compactEvent } from "@/pipeline/compact-fields.js";
import type { RuntimeEvent } from "@/types/events.js";

const event: RuntimeEvent = {
  id: "test-id",
  timestamp: 1000,
  source: "server-stderr",
  service: "main",
  level: "error",
  message: "test error",
  fingerprint: "abc123",
  signal_score: 72,
  signal_strength: "high",
  context: { file: "app.ts", line: 42, error_type: "TypeError" },
  raw: "raw line",
  first_seen: 900,
  occurrence_count: 3,
};

describe("compactEvent", () => {
  it("renames fields to short keys", () => {
    const compact = compactEvent(event);
    expect(compact.ss).toBe(72);
    expect(compact.fp).toBe("abc123");
    expect(compact.oc).toBe(3);
    expect(compact.msg).toBe("test error");
    expect(compact.ctx).toEqual({ file: "app.ts", line: 42, error_type: "TypeError" });
  });

  it("preserves id and timestamp", () => {
    const compact = compactEvent(event);
    expect(compact.id).toBe("test-id");
    expect(compact.ts).toBe(1000);
  });

  it("omits raw field", () => {
    const compact = compactEvent(event);
    expect(compact).not.toHaveProperty("raw");
  });
});
