/**
 * Tests for frontend crash bridge.
 */

import { describe, it, expect } from "vitest";
import { validateCrashReport, crashReportToEvent } from "@/correlation/frontend-crash-bridge.js";

describe("validateCrashReport", () => {
  it("validates a complete crash report", () => {
    const result = validateCrashReport({
      message: "TypeError: Cannot read properties of null",
      stack: "TypeError: Cannot read properties of null\n    at App (./src/App.tsx:42:5)",
      componentStack: "\n    in App\n    in ErrorBoundary",
      url: "http://localhost:5173/dashboard",
    });
    expect(result).not.toBeNull();
    expect(result!.message).toBe("TypeError: Cannot read properties of null");
  });

  it("rejects missing message", () => {
    expect(validateCrashReport({ stack: "some stack" })).toBeNull();
    expect(validateCrashReport({})).toBeNull();
  });

  it("truncates long messages", () => {
    const result = validateCrashReport({ message: "x".repeat(1000) });
    expect(result!.message.length).toBe(500);
  });

  it("accepts message-only report", () => {
    const result = validateCrashReport({ message: "Something broke" });
    expect(result).not.toBeNull();
    expect(result!.stack).toBeUndefined();
  });
});

describe("crashReportToEvent", () => {
  it("converts crash report to RuntimeEvent", () => {
    const event = crashReportToEvent({
      message: "TypeError: Cannot read properties of null",
      stack: "TypeError: Cannot read properties of null\n    at render (./src/components/Dashboard.tsx:42:5)",
    });
    expect(event.level).toBe("error");
    expect(event.message).toContain("[Frontend]");
    expect(event.signal_score).toBe(75);
    expect(event.context.error_type).toBe("TypeError");
    expect(event.context.file).toBe("./src/components/Dashboard.tsx");
    expect(event.context.line).toBe(42);
    expect(event.context.framework).toBe("react");
  });

  it("extracts error type from message", () => {
    const event = crashReportToEvent({ message: "ReferenceError: x is not defined" });
    expect(event.context.error_type).toBe("ReferenceError");
  });

  it("uses FrontendCrash for unknown error types", () => {
    const event = crashReportToEvent({ message: "Something went wrong" });
    expect(event.context.error_type).toBe("FrontendCrash");
  });

  it("skips node_modules frames for file extraction", () => {
    const event = crashReportToEvent({
      message: "Error",
      stack: "Error\n    at Object.render (node_modules/react/index.js:10:5)\n    at App (./src/App.tsx:15:3)",
    });
    expect(event.context.file).toBe("./src/App.tsx");
    expect(event.context.line).toBe(15);
  });

  it("handles missing stack trace", () => {
    const event = crashReportToEvent({ message: "Error" });
    expect(event.context.file).toBeUndefined();
    expect(event.context.line).toBeUndefined();
  });
});
