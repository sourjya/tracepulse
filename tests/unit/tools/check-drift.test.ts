/**
 * Tests for check_drift tool - unified drift detection across
 * environment, dependencies, migrations, and configuration.
 *
 * @see .kiro/specs/m12-ecosystem-features/design.md for drift detection design
 */

import { describe, it, expect, vi } from "vitest";
import { handleCheckDrift } from "@/tools/check-drift.js";

// Mock fs for env/dep file detection
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      const path = String(p);
      // Simulate a Python project with .env.example and alembic
      if (path.includes(".env.example")) return true;
      if (path.includes(".env")) return true;
      if (path.includes("alembic.ini")) return true;
      if (path.includes("requirements.txt")) return true;
      if (path.includes("package.json")) return false;
      return false;
    }),
    readFileSync: vi.fn((p: string) => {
      const path = String(p);
      if (path.includes(".env.example")) return "DATABASE_URL=\nREDIS_URL=\nSECRET_KEY=\n";
      if (path.includes(".env")) return "DATABASE_URL=postgres://localhost/db\nSECRET_KEY=abc\n";
      return "";
    }),
  };
});

describe("handleCheckDrift", () => {
  it("detects missing env variables", () => {
    const result = handleCheckDrift({ cwd: "/tmp/test" });
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.env).toBeDefined();
    expect(data.env.missing.length).toBeGreaterThan(0);
    expect(data.env.missing).toContain("REDIS_URL");
  });

  it("detects migration framework", () => {
    const result = handleCheckDrift({ cwd: "/tmp/test" });
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.migrations).toBeDefined();
    expect(data.migrations.framework).toBe("alembic");
  });

  it("returns overall drift status", () => {
    const result = handleCheckDrift({ cwd: "/tmp/test" });
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.status).toBeDefined();
    expect(["clean", "drifted"]).toContain(data.status);
  });

  it("includes recommendations when drift detected", () => {
    const result = handleCheckDrift({ cwd: "/tmp/test" });
    const data = JSON.parse((result.content[0] as { text: string }).text);

    if (data.status === "drifted") {
      expect(data.recommendations.length).toBeGreaterThan(0);
    }
  });

  it("returns all drift categories", () => {
    const result = handleCheckDrift({ cwd: "/tmp/test" });
    const data = JSON.parse((result.content[0] as { text: string }).text);

    expect(data.env).toBeDefined();
    expect(data.migrations).toBeDefined();
    expect(data.status).toBeDefined();
    expect(data.recommendations).toBeDefined();
  });
});
