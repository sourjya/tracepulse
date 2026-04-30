/**
 * Tests for get_migration_status tool handler.
 */

import { describe, it, expect, vi } from "vitest";
import { handleGetMigrationStatus } from "@/tools/get-migration-status.js";
import { existsSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

const mockedExistsSync = vi.mocked(existsSync);

function getResult(result: ReturnType<typeof handleGetMigrationStatus>): Record<string, unknown> {
  // Handle both sync and async results
  if (result && "content" in result) {
    return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
  }
  return {};
}

describe("handleGetMigrationStatus", () => {
  it("returns error when no framework detected", () => {
    mockedExistsSync.mockReturnValue(false);
    const result = handleGetMigrationStatus({}, "/tmp/test");
    const data = getResult(result as any);
    expect(data.error).toContain("No migration framework detected");
  });

  it("detects alembic from alembic.ini", () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes("alembic.ini"));
    const result = handleGetMigrationStatus({}, "/tmp/test");
    const data = getResult(result as any);
    expect(data.framework).toBe("alembic");
    expect(data.command).toContain("alembic");
  });

  it("detects prisma from schema.prisma", () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes("schema.prisma"));
    const result = handleGetMigrationStatus({}, "/tmp/test");
    const data = getResult(result as any);
    expect(data.framework).toBe("prisma");
  });

  it("detects django from manage.py", () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes("manage.py"));
    const result = handleGetMigrationStatus({}, "/tmp/test");
    const data = getResult(result as any);
    expect(data.framework).toBe("django");
  });

  it("accepts explicit framework", () => {
    mockedExistsSync.mockReturnValue(false);
    const result = handleGetMigrationStatus({ framework: "prisma" }, "/tmp/test");
    const data = getResult(result as any);
    expect(data.framework).toBe("prisma");
  });

  it("rejects unknown framework", () => {
    const result = handleGetMigrationStatus({ framework: "unknown" }, "/tmp/test");
    const data = getResult(result as any);
    expect(data.error).toContain("Unknown framework");
  });

  it("parses prisma output with pending migrations", async () => {
    mockedExistsSync.mockReturnValue(false);
    const mockRun = vi.fn().mockResolvedValue("Following migration have not yet been applied:\n20240101_init\n20240102_users");
    const result = await handleGetMigrationStatus({ framework: "prisma" }, "/tmp/test", mockRun);
    const data = getResult(result as any);
    expect(data.status).toBe("behind");
    expect(data.suggestion).toContain("prisma migrate deploy");
  });

  it("parses django output with unapplied migrations", async () => {
    mockedExistsSync.mockReturnValue(false);
    const mockRun = vi.fn().mockResolvedValue("[X] 0001_initial\n[ ] 0002_add_users\n[ ] 0003_add_roles");
    const result = await handleGetMigrationStatus({ framework: "django" }, "/tmp/test", mockRun);
    const data = getResult(result as any);
    expect(data.status).toBe("behind");
    expect(data.pending_count).toBe(2);
  });

  it("parses alembic output at head", async () => {
    mockedExistsSync.mockReturnValue(false);
    const mockRun = vi.fn().mockResolvedValue("abc123 (head)");
    const result = await handleGetMigrationStatus({ framework: "alembic" }, "/tmp/test", mockRun);
    const data = getResult(result as any);
    expect(data.status).toBe("up-to-date");
  });
});
