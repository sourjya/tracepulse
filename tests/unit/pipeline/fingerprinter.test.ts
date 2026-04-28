/**
 * Unit tests for the fingerprinter pipeline stage.
 *
 * The fingerprinter generates stable dedup keys from event properties using
 * SHA-256. Message normalization strips volatile content (timestamps, PIDs,
 * memory addresses, UUIDs) so that logically identical errors produce the
 * same fingerprint across runs.
 *
 * @see src/pipeline/fingerprinter.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { fingerprint, normalizeForFingerprint } from "@/pipeline/fingerprinter";

// ──────────────────────────────────────────────
// normalizeForFingerprint
// ──────────────────────────────────────────────

describe("normalizeForFingerprint", () => {
  it("strips ISO 8601 timestamps", () => {
    const msg = "Error at 2026-04-27T12:00:00.000Z in module";
    expect(normalizeForFingerprint(msg)).toBe("Error at in module");
  });

  it("strips ISO 8601 timestamps without milliseconds", () => {
    const msg = "Error at 2026-04-27T12:00:00Z in module";
    expect(normalizeForFingerprint(msg)).toBe("Error at in module");
  });

  it("strips Unix timestamps (10+ digit numbers)", () => {
    const msg = "failed at 1714233600000 with code 1";
    expect(normalizeForFingerprint(msg)).toBe("failed at with code 1");
  });

  it("strips PID patterns (pid=12345)", () => {
    const msg = "Worker pid=54321 crashed";
    expect(normalizeForFingerprint(msg)).toBe("Worker crashed");
  });

  it("strips PID patterns (PID: 12345)", () => {
    const msg = "Process PID: 9876 exited";
    expect(normalizeForFingerprint(msg)).toBe("Process exited");
  });

  it("strips memory addresses (0x...)", () => {
    const msg = "Segfault at 0x7fff5fbff8a0 in main";
    expect(normalizeForFingerprint(msg)).toBe("Segfault at in main");
  });

  it("strips UUIDs", () => {
    const msg = "Request a1b2c3d4-e5f6-7890-abcd-ef1234567890 failed";
    expect(normalizeForFingerprint(msg)).toBe("Request failed");
  });

  it("collapses multiple whitespace to single space", () => {
    const msg = "Error   in    module";
    expect(normalizeForFingerprint(msg)).toBe("Error in module");
  });

  it("trims leading and trailing whitespace", () => {
    const msg = "  Error in module  ";
    expect(normalizeForFingerprint(msg)).toBe("Error in module");
  });
});

// ──────────────────────────────────────────────
// fingerprint
// ──────────────────────────────────────────────

describe("fingerprint", () => {
  it("produces deterministic output for the same input", () => {
    const a = fingerprint("server-stderr", "TypeError: x is not a function");
    const b = fingerprint("server-stderr", "TypeError: x is not a function");
    expect(a).toBe(b);
  });

  it("produces different fingerprints for different messages", () => {
    const a = fingerprint("server-stderr", "TypeError: x is not a function");
    const b = fingerprint("server-stderr", "ReferenceError: y is not defined");
    expect(a).not.toBe(b);
  });

  it("returns a valid 64-char hex SHA-256 digest", () => {
    const result = fingerprint("server-stdout", "some error");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across whitespace variations in the message", () => {
    const a = fingerprint("server-stderr", "Error   in   module");
    const b = fingerprint("server-stderr", "Error in module");
    expect(a).toBe(b);
  });

  it("includes source in the hash input", () => {
    const a = fingerprint("server-stdout", "connection refused");
    const b = fingerprint("server-stderr", "connection refused");
    expect(a).not.toBe(b);
  });

  it("includes file:line when provided", () => {
    const a = fingerprint("server-stderr", "TypeError", "app.ts", 42);
    const b = fingerprint("server-stderr", "TypeError", "app.ts", 99);
    expect(a).not.toBe(b);
  });

  it("produces a valid hash without file:line", () => {
    const result = fingerprint("server-stderr", "TypeError");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs when only file is provided vs file+line", () => {
    const a = fingerprint("server-stderr", "TypeError", "app.ts");
    const b = fingerprint("server-stderr", "TypeError", "app.ts", 10);
    expect(a).not.toBe(b);
  });
});
