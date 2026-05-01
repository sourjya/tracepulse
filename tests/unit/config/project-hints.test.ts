/**
 * Tests for project hints reader.
 */

import { describe, it, expect } from "vitest";
import { readProjectHints } from "@/config/project-hints.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("readProjectHints", () => {
  it("returns empty hints when no steering files exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-test-"));
    const hints = readProjectHints(dir);
    expect(hints).toEqual({});
    rmSync(dir, { recursive: true });
  });

  it("extracts language and framework from tech.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-test-"));
    mkdirSync(join(dir, ".kiro", "steering"), { recursive: true });
    writeFileSync(join(dir, ".kiro", "steering", "tech.md"), `
# Tech Stack
- **Runtime**: Python 3.12
- **Framework**: FastAPI
- **Test runner**: pytest
- **Database**: PostgreSQL
    `);
    const hints = readProjectHints(dir);
    expect(hints.language).toBe("Python");
    expect(hints.framework).toBe("FastAPI");
    expect(hints.testRunner).toBe("pytest");
    expect(hints.database).toBe("PostgreSQL");
    rmSync(dir, { recursive: true });
  });

  it("extracts from user-project-overrides.md as fallback", () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-test-"));
    mkdirSync(join(dir, ".kiro", "steering"), { recursive: true });
    writeFileSync(join(dir, ".kiro", "steering", "user-project-overrides.md"), `
- **Runtime**: Node.js 22+ with TypeScript
- **Build**: tsup
- **Test runner**: vitest
    `);
    const hints = readProjectHints(dir);
    expect(hints.language).toBe("Node.js");
    expect(hints.testRunner).toBe("vitest");
    rmSync(dir, { recursive: true });
  });

  it("handles Go projects", () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-test-"));
    mkdirSync(join(dir, ".kiro", "steering"), { recursive: true });
    writeFileSync(join(dir, ".kiro", "steering", "tech.md"), `
Backend: Go with Gin framework
Testing: go test
    `);
    const hints = readProjectHints(dir);
    expect(hints.language).toBe("Go");
    rmSync(dir, { recursive: true });
  });
});
