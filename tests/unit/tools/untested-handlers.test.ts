/**
 * Tests for previously untested tool handlers.
 * Addresses TQR-002 H2: 9 untested tool handlers.
 */

import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { addEmptyDiagnostics } from "@/tools/empty-diagnostics.js";
import { handleGetProjectHealth } from "@/tools/get-project-health.js";
import { handleVerifyBuild } from "@/tools/verify-build.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  const now = Date.now();
  return {
    id: crypto.randomUUID(), timestamp: now, source: "server-stderr", service: "main",
    level: "error", message: "Test error", raw: "Test error",
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    signal_score: 60, signal_strength: "high" as const,
    occurrence_count: 1, first_seen: now, context: {},
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// empty-diagnostics
// ──────────────────────────────────────────────

describe("addEmptyDiagnostics", () => {
  it("adds diagnostics and suggested_next when response is empty", () => {
    const result = addEmptyDiagnostics("get_errors", { errors: [] }, true);
    expect(result.diagnostics).toBeDefined();
    expect(result.suggested_next).toBeDefined();
    expect((result.suggested_next as string[]).length).toBeGreaterThan(0);
  });

  it("does not add diagnostics when response is not empty", () => {
    const result = addEmptyDiagnostics("get_errors", { errors: [{ id: 1 }] }, false);
    expect(result.diagnostics).toBeUndefined();
  });

  it("returns original response for unknown tool", () => {
    const original = { data: "test" };
    const result = addEmptyDiagnostics("unknown_tool", original, true);
    expect(result).toEqual(original);
  });

  it("includes routing hints for get_correlated_errors", () => {
    const result = addEmptyDiagnostics("get_correlated_errors", { correlations: [] }, true);
    expect(result.diagnostics).toContain("No correlations");
    expect(result.suggested_next).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// get-project-health
// ──────────────────────────────────────────────

describe("handleGetProjectHealth", () => {
  it("returns healthy when no errors", () => {
    const buffer = createRingBuffer(100);
    const result = handleGetProjectHealth(buffer, () => true, null);
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.healthy).toBe(true);
    expect(data.errors.runtime).toBe(0);
    expect(data.errors.build).toBe(0);
  });

  it("returns unhealthy when errors exist", () => {
    const buffer = createRingBuffer(100);
    buffer.push(makeEvent({ level: "error" }));
    const result = handleGetProjectHealth(buffer, () => true, null);
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.healthy).toBe(false);
    expect(data.errors.runtime).toBe(1);
  });

  it("returns unhealthy when disconnected", () => {
    const buffer = createRingBuffer(100);
    const result = handleGetProjectHealth(buffer, () => false, null);
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.healthy).toBe(false);
    expect(data.summary).toContain("DISCONNECTED");
  });

  it("detects migration framework when cwd provided", () => {
    const buffer = createRingBuffer(100);
    // Use a temp dir that doesn't have alembic/prisma - should return no migrations
    const result = handleGetProjectHealth(buffer, () => true, null, "/tmp");
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.migrations).toBeUndefined(); // no framework detected in /tmp
  });
});

// ──────────────────────────────────────────────
// verify-build
// ──────────────────────────────────────────────

describe("handleVerifyBuild", () => {
  it("rejects unknown typecheck command", async () => {
    const buffer = createRingBuffer(100);
    const result = await handleVerifyBuild(buffer, { typecheck_command: "evil-command" });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("typecheck_command must be one of");
  });

  it("rejects unknown build command", async () => {
    const buffer = createRingBuffer(100);
    const result = await handleVerifyBuild(buffer, { build_command: "evil-build" });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("build_command must be one of");
  });
});
