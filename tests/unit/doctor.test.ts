/**
 * Tests for tracepulse doctor command.
 *
 * @see src/diagnostics/doctor.ts
 */

import { describe, it, expect } from "vitest";
import { runDoctorChecks } from "@/diagnostics/doctor.js";

describe("doctor checks", () => {
  it("returns an array of checks", () => {
    const checks = runDoctorChecks(process.cwd());
    expect(checks).toBeInstanceOf(Array);
    expect(checks.length).toBeGreaterThan(0);
  });

  it("each check has name, status, and message", () => {
    const checks = runDoctorChecks(process.cwd());
    for (const check of checks) {
      expect(check.name).toBeDefined();
      expect(["pass", "warn", "fail"]).toContain(check.status);
      expect(check.message).toBeDefined();
    }
  });

  it("detects Node.js version", () => {
    const checks = runDoctorChecks(process.cwd());
    const nodeCheck = checks.find(c => c.name === "Node.js version");
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.status).toBe("pass");
  });

  it("detects project stacks", () => {
    const checks = runDoctorChecks(process.cwd());
    const stackCheck = checks.find(c => c.name === "Project detection");
    expect(stackCheck).toBeDefined();
  });
});
