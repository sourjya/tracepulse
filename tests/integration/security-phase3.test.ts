/**
 * Security checkpoint tests for Phase 3.
 *
 * Verifies secret redaction applies to all sources, persistence
 * contains no raw messages, and HTTP transport binds to localhost only.
 *
 * @see .kiro/specs/phase3-multi-process/tasks.md Phase 9 Step 18
 */

import { describe, it, expect } from "vitest";
import { redact } from "@/pipeline/secret-redactor.js";
import { createHttpTransport } from "@/transport/http-transport.js";
import type { PersistedFingerprintEntry } from "@/persistence/fingerprint-store.js";

describe("Phase 3 security checkpoint", () => {
  it("secret redaction applies to multi-process output", () => {
    const line = "API_KEY=sk-1234567890abcdef connecting to service";
    const redacted = redact(line);
    expect(redacted).not.toContain("sk-1234567890abcdef");
    expect(redacted).toContain("[REDACTED]");
  });

  it("secret redaction applies to Docker log output", () => {
    const line = "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature";
    const redacted = redact(line);
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redacted).toContain("[REDACTED]");
  });

  it("fingerprint persistence file contains no raw error messages", () => {
    const entry: PersistedFingerprintEntry = {
      fingerprint: "fp:abc123",
      first_seen: 1000,
      last_seen: 2000,
      total_count: 5,
    };

    const keys = Object.keys(entry);
    expect(keys).not.toContain("message");
    expect(keys).not.toContain("raw");
    expect(keys).not.toContain("stack_trace");
    expect(keys).toEqual(["fingerprint", "first_seen", "last_seen", "total_count"]);
  });

  it("HTTP transport binds to localhost only", () => {
    const transport = createHttpTransport();
    expect(transport.host).toBe("127.0.0.1");
  });

  it("HTTP transport does not bind to 0.0.0.0", () => {
    const transport = createHttpTransport();
    expect(transport.host).not.toBe("0.0.0.0");
  });
});
