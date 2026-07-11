/**
 * Tests for stack-aware run_and_watch allowlist expansion.
 *
 * When project stacks are detected, the allowlist should auto-expand
 * to include stack-specific commands without manual configuration.
 *
 * @see src/tools/run-and-watch.ts for allowlist
 * @see src/diagnostics/project-detector.ts for stack detection
 */

import { describe, it, expect } from "vitest";
import { buildAllowlist } from "@/tools/run-and-watch-allowlist.js";
import type { ProjectStack } from "@/diagnostics/project-detector.js";

function stack(name: ProjectStack["name"]): ProjectStack {
  return { name, detected_by: "test" };
}

describe("buildAllowlist", () => {
  it("includes base commands with no stacks", () => {
    const list = buildAllowlist([]);
    expect(list).toContain("node");
    expect(list).toContain("npx");
    expect(list).toContain("npm");
  });

  // ──────────────────────────────────────────────
  // CIQ-605: Python/Go/Rust must work WITHOUT stack detection
  // ──────────────────────────────────────────────

  it("CIQ-605: python is in base (no stack detection needed)", () => {
    const list = buildAllowlist([]);
    expect(list).toContain("python");
    expect(list).toContain("python3");
    expect(list).toContain("pytest");
  });

  it("CIQ-605: .venv/bin/ prefix works without stack detection", () => {
    const list = buildAllowlist([]);
    expect(list).toContain(".venv/bin/");
  });

  it("CIQ-605: uv and uv run are in base", () => {
    const list = buildAllowlist([]);
    expect(list).toContain("uv");
    expect(list).toContain("uv run");
  });

  it("CIQ-605: go commands are in base", () => {
    const list = buildAllowlist([]);
    expect(list).toContain("go test");
    expect(list).toContain("go run");
    expect(list).toContain("go build");
    expect(list).toContain("go vet");
  });

  it("CIQ-605: cargo is in base", () => {
    const list = buildAllowlist([]);
    expect(list).toContain("cargo");
  });

  it("CIQ-605: sh is in base (for sh scripts/)", () => {
    const list = buildAllowlist([]);
    expect(list).toContain("sh");
  });

  it("CIQ-605: bash is in base", () => {
    const list = buildAllowlist([]);
    expect(list).toContain("bash");
  });

  // ──────────────────────────────────────────────
  // Stack-specific additions (uncommon tools still gated)
  // ──────────────────────────────────────────────

  it("adds Python-specific uncommon tools for python stack", () => {
    const list = buildAllowlist([stack("python")]);
    expect(list).toContain("mypy");
    expect(list).toContain("ruff");
    expect(list).toContain("pip");
    expect(list).toContain("alembic");
    expect(list).toContain("django-admin");
  });

  it("adds Java commands for java stack", () => {
    const list = buildAllowlist([stack("java")]);
    expect(list).toContain("mvn");
    expect(list).toContain("gradle");
    expect(list).toContain("./gradlew");
  });

  it("combines multiple stacks", () => {
    const list = buildAllowlist([stack("python"), stack("node")]);
    expect(list).toContain("python");
    expect(list).toContain("npx");
  });

  it("has no duplicates", () => {
    const list = buildAllowlist([stack("python"), stack("node")]);
    const unique = new Set(list);
    expect(unique.size).toBe(list.length);
  });
});

describe("run_and_watch env var prefix stripping", () => {
  it("allows commands with leading KEY=val env var prefix", async () => {
    // PYTHONPATH=src uv run pytest → should strip PYTHONPATH=src and check "uv run pytest"
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const pythonAllowlist = buildAllowlist([stack("python")]);
    const result = await handleRunAndWatch(
      { command: "PYTHONPATH=src uv run pytest --version", timeout_seconds: 5 },
      pythonAllowlist,
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    // Should not be "Command not allowed" - it should attempt to run
    expect(text).not.toContain("Command not allowed");
  });

  it("allows multiple env var prefixes", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const pythonAllowlist = buildAllowlist([stack("python")]);
    const result = await handleRunAndWatch(
      { command: "PYTHONPATH=src DEBUG=1 uv run pytest --version", timeout_seconds: 5 },
      pythonAllowlist,
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("still rejects unknown commands even with env var prefix", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: "FOO=bar rm -rf /", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain("Command not allowed");
  });
});

// ──────────────────────────────────────────────
// CIQ-605 Regression: commands accepted without stack detection
// These test the actual handleRunAndWatch function with DEFAULT allowlist
// (buildAllowlist([])) — the exact scenario that was broken.
// ──────────────────────────────────────────────

describe("CIQ-605: handleRunAndWatch accepts Python/Go/Rust without stack detection", () => {
  it("accepts 'python -m pytest' without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: "python -m pytest --version", timeout_seconds: 5 },
      buildAllowlist([]), // No stacks detected — the broken scenario
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("accepts 'python3 -m pytest' without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: "python3 -m pytest tests/", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("accepts '.venv/bin/python' without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: ".venv/bin/python -m myapp.server", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("accepts '.venv/bin/pytest' without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: ".venv/bin/pytest tests/ -v", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("accepts 'pytest' without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: "pytest tests/ -v --tb=short", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("accepts 'uv run pytest' without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: "uv run pytest tests/", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("accepts 'go test ./...' without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: "go test ./...", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("accepts 'cargo test' without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: "cargo test --release", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("accepts 'sh scripts/run.sh' without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: "sh scripts/run.sh", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("accepts 'bash scripts/start.sh' without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: "bash scripts/start.sh", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).not.toContain("Command not allowed");
  });

  it("still rejects unknown commands without stack detection", async () => {
    const { handleRunAndWatch } = await import("@/tools/run-and-watch.js");
    const result = await handleRunAndWatch(
      { command: "rm -rf /tmp/test", timeout_seconds: 5 },
      buildAllowlist([]),
    );
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain("Command not allowed");
  });
});
