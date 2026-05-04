/**
 * Tests for pre-spawn validation in start_server.
 *
 * start_server should validate the command BEFORE attempting to spawn,
 * returning actionable diagnostics for common issues.
 *
 * @see src/tools/start-server.ts
 */

import { describe, it, expect } from "vitest";
import { validateStartCommand } from "@/tools/start-server-validation.js";

describe("validateStartCommand", () => {
  it("rejects shell env var syntax", () => {
    const result = validateStartCommand("PYTHONPATH=src python app.py");
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].issue).toContain("shell syntax");
  });

  it("rejects shell operators", () => {
    const result = validateStartCommand("cd backend && python app.py");
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].fix).toContain("cwd");
  });

  it("accepts valid commands", () => {
    const result = validateStartCommand("npm run dev");
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("accepts bash wrapper", () => {
    const result = validateStartCommand("bash scripts/start.sh");
    expect(result.valid).toBe(true);
  });

  it("accepts python commands", () => {
    const result = validateStartCommand("python manage.py runserver");
    expect(result.valid).toBe(true);
  });

  it("warns about npm run without package.json", () => {
    const result = validateStartCommand("npm run dev", "/tmp/empty-" + Date.now());
    expect(result.diagnostics.some(d => d.issue.includes("package.json"))).toBe(true);
  });
});
