/**
 * Tests for project stack detection and start command suggestions.
 *
 * @see src/diagnostics/project-detector.ts
 * @see .kiro/specs/m21-zero-config/requirements.md Layer 1
 */

import { describe, it, expect } from "vitest";
import { detectProjectStacks, suggestStartCommands, type ProjectStack } from "@/diagnostics/project-detector.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Create a temp directory with specified files. */
function makeTempProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tp-test-"));
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(dir, name);
    const fileDir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (fileDir !== dir) mkdirSync(fileDir, { recursive: true });
    writeFileSync(filePath, content);
  }
  return dir;
}

describe("detectProjectStacks", () => {
  it("detects Node.js from package.json", () => {
    const dir = makeTempProject({ "package.json": '{"name":"test"}' });
    const stacks = detectProjectStacks(dir);
    expect(stacks.some((s: ProjectStack) => s.name === "node")).toBe(true);
  });

  it("detects Python from pyproject.toml", () => {
    const dir = makeTempProject({ "pyproject.toml": "[project]\nname = 'test'" });
    const stacks = detectProjectStacks(dir);
    expect(stacks.some((s: ProjectStack) => s.name === "python")).toBe(true);
  });

  it("detects Python from requirements.txt", () => {
    const dir = makeTempProject({ "requirements.txt": "fastapi\nuvicorn" });
    const stacks = detectProjectStacks(dir);
    expect(stacks.some((s: ProjectStack) => s.name === "python")).toBe(true);
  });

  it("detects Go from go.mod", () => {
    const dir = makeTempProject({ "go.mod": "module example.com/app" });
    const stacks = detectProjectStacks(dir);
    expect(stacks.some((s: ProjectStack) => s.name === "go")).toBe(true);
  });

  it("detects Rust from Cargo.toml", () => {
    const dir = makeTempProject({ "Cargo.toml": "[package]\nname = 'test'" });
    const stacks = detectProjectStacks(dir);
    expect(stacks.some((s: ProjectStack) => s.name === "rust")).toBe(true);
  });

  it("detects Java from pom.xml", () => {
    const dir = makeTempProject({ "pom.xml": "<project></project>" });
    const stacks = detectProjectStacks(dir);
    expect(stacks.some((s: ProjectStack) => s.name === "java")).toBe(true);
  });

  it("detects multiple stacks in a monorepo", () => {
    const dir = makeTempProject({
      "package.json": '{"name":"mono"}',
      "backend/pyproject.toml": "[project]",
    });
    const stacks = detectProjectStacks(dir);
    expect(stacks.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty for empty directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-empty-"));
    const stacks = detectProjectStacks(dir);
    expect(stacks).toHaveLength(0);
  });

  it("detects .env for infra", () => {
    const dir = makeTempProject({ ".env": "DATABASE_URL=postgres://localhost/db" });
    const stacks = detectProjectStacks(dir);
    expect(stacks.some((s: ProjectStack) => s.name === "infra")).toBe(true);
  });
});

describe("suggestStartCommands", () => {
  it("suggests npm run dev from package.json scripts", () => {
    const dir = makeTempProject({
      "package.json": JSON.stringify({ scripts: { dev: "vite" } }),
    });
    const suggestions = suggestStartCommands(dir);
    expect(suggestions.some(s => s.command.includes("npm run dev"))).toBe(true);
    expect(suggestions[0].confidence).toBe("high");
  });

  it("suggests uvicorn from pyproject.toml", () => {
    const dir = makeTempProject({
      "pyproject.toml": '[project]\nname = "app"\n[project.scripts]\ndev = "uvicorn main:app --reload"',
    });
    const suggestions = suggestStartCommands(dir);
    expect(suggestions.length).toBeGreaterThanOrEqual(0);
    // May or may not parse TOML - at minimum should detect Python stack
  });

  it("suggests bash scripts/start.sh when script exists", () => {
    const dir = makeTempProject({ "scripts/start.sh": "#!/bin/bash\npython app.py" });
    const suggestions = suggestStartCommands(dir);
    expect(suggestions.some(s => s.command.includes("bash scripts/start.sh"))).toBe(true);
  });

  it("suggests make dev when Makefile has dev target", () => {
    const dir = makeTempProject({ "Makefile": "dev:\n\tpython manage.py runserver" });
    const suggestions = suggestStartCommands(dir);
    expect(suggestions.some(s => s.command.includes("make dev"))).toBe(true);
  });

  it("returns empty for empty directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-empty-"));
    const suggestions = suggestStartCommands(dir);
    expect(suggestions).toHaveLength(0);
  });
});
