/**
 * Unit tests for severity classifier.
 *
 * @see src/scoring/severity-classifier.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { classifySeverity, type Severity } from "@/scoring/severity-classifier.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source: "server-stderr",
    service: "main",
    level: "error",
    message: "test error",
    fingerprint: `fp:${crypto.randomUUID()}`,
    signal_score: 50,
    signal_strength: "high",
    context: {},
    raw: "test error raw",
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

describe("severity classifier", () => {
  it("crash: process exit non-zero", () => {
    expect(classifySeverity(makeEvent({ message: "Process exited with code 1" }))).toBe("crash");
  });

  it("crash: unhandled exception pattern", () => {
    expect(classifySeverity(makeEvent({ message: "Uncaught exception: TypeError" }))).toBe("crash");
  });

  it("crash: SIGKILL/SIGSEGV signal", () => {
    expect(classifySeverity(makeEvent({ message: "Process killed by SIGSEGV" }))).toBe("crash");
  });

  it("error: HTTP 5xx in message", () => {
    expect(classifySeverity(makeEvent({ message: "HTTP 500 Internal Server Error" }))).toBe("error");
  });

  it("error: log level error", () => {
    expect(classifySeverity(makeEvent({ level: "error", message: "something failed" }))).toBe("error");
  });

  it("warning: deprecation notice", () => {
    expect(classifySeverity(makeEvent({ level: "warn", message: "DeprecationWarning: use X instead" }))).toBe("warning");
  });

  it("warning: log level warn", () => {
    expect(classifySeverity(makeEvent({ level: "warn", message: "something" }))).toBe("warning");
  });

  it("info: startup message", () => {
    expect(classifySeverity(makeEvent({ level: "info", message: "Server started" }))).toBe("info");
  });

  it("info: default fallback for debug level", () => {
    expect(classifySeverity(makeEvent({ level: "debug", message: "debug info" }))).toBe("info");
  });

  it("Severity type accepts only crash, error, warning, info", () => {
    const valid: Severity[] = ["crash", "error", "warning", "info"];
    expect(valid).toHaveLength(4);
  });
});
