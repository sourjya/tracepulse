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

  it("adds Python commands for python stack", () => {
    const list = buildAllowlist([stack("python")]);
    expect(list).toContain("python");
    expect(list).toContain("pytest");
    expect(list).toContain(".venv/bin/python");
    expect(list).toContain(".venv/bin/pytest");
    expect(list).toContain("uv");
    expect(list).toContain("uv run");
    expect(list).toContain("pip");
  });

  it("adds Go commands for go stack", () => {
    const list = buildAllowlist([stack("go")]);
    expect(list).toContain("go test");
    expect(list).toContain("go run");
    expect(list).toContain("go build");
  });

  it("adds Rust commands for rust stack", () => {
    const list = buildAllowlist([stack("rust")]);
    expect(list).toContain("cargo test");
    expect(list).toContain("cargo build");
    expect(list).toContain("cargo run");
    expect(list).toContain("cargo check");
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
