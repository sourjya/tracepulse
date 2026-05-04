/**
 * Tests for startup diagnostics.
 *
 * @see src/diagnostics/startup-diagnostics.ts
 */

import { describe, it, expect } from "vitest";
import { diagnoseStartupFailure, formatDiagnostics } from "@/diagnostics/startup-diagnostics.js";

describe("diagnoseStartupFailure", () => {
  it("detects shell env var syntax (VAR=val cmd)", () => {
    const findings = diagnoseStartupFailure(
      "PYTHONPATH=src python -m myapp",
      "Command failed",
    );
    expect(findings.some(f => f.issue.includes("shell syntax"))).toBe(true);
    expect(findings.some(f => f.fix.includes("env"))).toBe(true);
  });

  it("detects shell operators", () => {
    const findings = diagnoseStartupFailure(
      "cd backend && python -m app",
      "Command failed",
    );
    expect(findings.some(f => f.issue.includes("shell operators"))).toBe(true);
    expect(findings.some(f => f.fix.includes("bash"))).toBe(true);
  });

  it("detects Python ModuleNotFoundError without venv", () => {
    const findings = diagnoseStartupFailure(
      "python -m myapp.server",
      "ModuleNotFoundError: No module named 'fastapi'",
    );
    expect(findings.some(f => f.issue.includes("fastapi"))).toBe(true);
    expect(findings.some(f => f.fix.includes("pip install"))).toBe(true);
  });

  it("detects port already in use", () => {
    const findings = diagnoseStartupFailure(
      "python -m myapp",
      "EADDRINUSE: address already in use port 8000",
    );
    expect(findings.some(f => f.issue.includes("8000"))).toBe(true);
  });

  it("returns empty for unknown failures", () => {
    const findings = diagnoseStartupFailure(
      "some-command",
      "Unknown error",
    );
    // May have info-level findings but no errors
    expect(findings.filter(f => f.severity === "error")).toHaveLength(0);
  });
});

describe("formatDiagnostics", () => {
  it("formats findings with severity icons", () => {
    const output = formatDiagnostics([
      { issue: "test issue", fix: "test fix", severity: "error" },
    ]);
    expect(output).toContain("✗");
    expect(output).toContain("test issue");
    expect(output).toContain("Fix: test fix");
  });

  it("returns empty string for no findings", () => {
    expect(formatDiagnostics([])).toBe("");
  });
});
