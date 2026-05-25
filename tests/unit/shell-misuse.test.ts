/**
 * Tests for shell misuse detection in get_session_insights.
 *
 * Verifies that shell calls matching test/build/lint patterns are flagged,
 * and that legitimate shell usage (git, file inspection) is not.
 *
 * @see src/analysis/shell-misuse.ts for implementation
 * @see src/constants/shell-misuse.ts for pattern definitions
 */

import { describe, it, expect } from "vitest";
import { detectShellMisuse } from "@/analysis/shell-misuse.js";
import type { AuditRecord } from "@/store/audit-buffer.js";

function shellEntry(command: string, timestamp = Date.now()): AuditRecord {
  return { tool: "shell", timestamp, params: { command }, response_tokens: 200, duration_ms: 100 };
}

function otherEntry(tool: string, timestamp = Date.now()): AuditRecord {
  return { tool, timestamp, params: {}, response_tokens: 100, duration_ms: 50 };
}

describe("detectShellMisuse", () => {
  it("flags pytest via shell", () => {
    const result = detectShellMisuse([shellEntry("pytest tests/ -v")]);
    expect(result.count).toBe(1);
    expect(result.violations[0].command).toContain("pytest");
    expect(result.recommendation).not.toBeNull();
  });

  it("flags vitest via shell", () => {
    const result = detectShellMisuse([shellEntry("npx vitest run")]);
    expect(result.count).toBe(1);
    expect(result.violations[0].command).toContain("vitest");
  });

  it("flags tsc via shell", () => {
    const result = detectShellMisuse([shellEntry("tsc --noEmit")]);
    expect(result.count).toBe(1);
  });

  it("flags npm run build via shell", () => {
    const result = detectShellMisuse([shellEntry("npm run build")]);
    expect(result.count).toBe(1);
  });

  it("flags uv build via shell", () => {
    const result = detectShellMisuse([shellEntry("uv build")]);
    expect(result.count).toBe(1);
  });

  it("flags docker compose build via shell", () => {
    const result = detectShellMisuse([shellEntry("docker compose build")]);
    expect(result.count).toBe(1);
  });

  it("flags eslint via shell", () => {
    const result = detectShellMisuse([shellEntry("npx eslint src/")]);
    expect(result.count).toBe(1);
  });

  it("flags cargo test via shell", () => {
    const result = detectShellMisuse([shellEntry("cargo test --release")]);
    expect(result.count).toBe(1);
  });

  it("flags go test via shell", () => {
    const result = detectShellMisuse([shellEntry("go test ./...")]);
    expect(result.count).toBe(1);
  });

  it("detects output truncation (pipe to tail)", () => {
    const result = detectShellMisuse([shellEntry("pytest tests/ 2>&1 | tail -5")]);
    expect(result.count).toBe(1);
    expect(result.violations[0].truncated_output).toBe(true);
  });

  it("does not flag git commands", () => {
    const result = detectShellMisuse([
      shellEntry("git status"),
      shellEntry("git diff --stat"),
      shellEntry("git log --oneline -5"),
    ]);
    expect(result.count).toBe(0);
    expect(result.recommendation).toBeNull();
  });

  it("does not flag file inspection", () => {
    const result = detectShellMisuse([
      shellEntry("cat src/index.ts"),
      shellEntry("ls -la"),
      shellEntry("head -20 package.json"),
    ]);
    expect(result.count).toBe(0);
  });

  it("does not flag curl", () => {
    const result = detectShellMisuse([shellEntry("curl http://localhost:8000/health")]);
    expect(result.count).toBe(0);
  });

  it("ignores non-shell tool calls", () => {
    const result = detectShellMisuse([
      otherEntry("get_errors"),
      otherEntry("run_and_watch"),
      otherEntry("verify_fix"),
    ]);
    expect(result.count).toBe(0);
  });

  it("caps violations at 5", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      shellEntry(`pytest test_${i}.py`),
    );
    const result = detectShellMisuse(entries);
    expect(result.count).toBe(10);
    expect(result.violations.length).toBe(5);
  });

  it("returns empty result for empty input", () => {
    const result = detectShellMisuse([]);
    expect(result.count).toBe(0);
    expect(result.violations).toHaveLength(0);
    expect(result.recommendation).toBeNull();
  });

  it("truncates long commands in violations", () => {
    const longCmd = "pytest " + "a".repeat(200) + "/test.py";
    const result = detectShellMisuse([shellEntry(longCmd)]);
    expect(result.violations[0].command.length).toBeLessThanOrEqual(120);
  });

  it("handles mixed legitimate and misuse calls", () => {
    const result = detectShellMisuse([
      shellEntry("git status"),
      shellEntry("npm run build"),
      shellEntry("ls -la"),
      shellEntry("vitest run"),
      shellEntry("cat README.md"),
    ]);
    expect(result.count).toBe(2);
  });
});
