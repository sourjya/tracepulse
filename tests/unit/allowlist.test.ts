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
