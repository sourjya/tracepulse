/**
 * MCP tool handler for check_drift - unified drift detection.
 *
 * Checks for drift across multiple dimensions in one call:
 * - Environment: missing vars in .env vs .env.example
 * - Migrations: detected framework + pending status hint
 * - Dependencies: package.json/requirements.txt existence
 *
 * Returns an overall "clean" or "drifted" status with actionable
 * recommendations. Designed as the pre-commit and session-start
 * health gate for the "drift detection layer" positioning.
 *
 * @see docs/roadmap/roadmap.md M13 #5
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectMigrationFramework, hasPackageJson, isPythonProject } from "@/diagnostics/project-detector.js";

// ──────────────────────────────────────────────
// Env Drift Detection
// ──────────────────────────────────────────────

/** Compare .env against .env.example to find missing variables. */
function checkEnvDrift(cwd: string): { present: string[]; missing: string[]; extra: string[] } {
  const examplePath = resolve(cwd, ".env.example");
  const envPath = resolve(cwd, ".env");

  if (!existsSync(examplePath)) {
    return { present: [], missing: [], extra: [] };
  }

  const parseKeys = (content: string): string[] =>
    content.split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => l.split("=")[0].trim());

  const exampleKeys = parseKeys(existsSync(examplePath) ? readFileSync(examplePath, "utf-8") : "");
  const envKeys = new Set(parseKeys(existsSync(envPath) ? readFileSync(envPath, "utf-8") : ""));

  const missing = exampleKeys.filter((k) => !envKeys.has(k));
  const present = exampleKeys.filter((k) => envKeys.has(k));
  const extra = [...envKeys].filter((k) => !exampleKeys.includes(k));

  return { present, missing, extra };
}

// ──────────────────────────────────────────────
// Migration Drift Detection
// ──────────────────────────────────────────────

/** Check migration drift using centralized detection. */
function checkMigrationDrift(cwd: string): { framework: string | null; hint: string } {
  const framework = detectMigrationFramework(cwd);
  return framework
    ? { framework, hint: "Run get_migration_status() to check pending migrations" }
    : { framework: null, hint: "No migration framework detected" };
}

// ──────────────────────────────────────────────
// Dependency Drift Detection
// ──────────────────────────────────────────────

/** Check for dependency manifest and lock file presence. */
function checkDepsDrift(cwd: string): { manager: string | null; has_lockfile: boolean; hint: string } {
  // Node.js
  if (hasPackageJson(cwd)) {
    const hasLock = existsSync(resolve(cwd, "package-lock.json")) ||
                    existsSync(resolve(cwd, "pnpm-lock.yaml")) ||
                    existsSync(resolve(cwd, "yarn.lock")) ||
                    existsSync(resolve(cwd, "bun.lockb"));
    return {
      manager: "npm",
      has_lockfile: hasLock,
      hint: hasLock ? "Lock file present" : "No lock file - run npm install to generate",
    };
  }
  if (isPythonProject(cwd)) {
    const hasLock = existsSync(resolve(cwd, "uv.lock")) ||
                    existsSync(resolve(cwd, "poetry.lock")) ||
                    existsSync(resolve(cwd, "Pipfile.lock"));
    return {
      manager: "python",
      has_lockfile: hasLock,
      hint: hasLock ? "Lock file present" : "No lock file detected",
    };
  }
  // Go
  if (existsSync(resolve(cwd, "go.mod"))) {
    const hasLock = existsSync(resolve(cwd, "go.sum"));
    return { manager: "go", has_lockfile: hasLock, hint: hasLock ? "go.sum present" : "Run go mod tidy" };
  }
  return { manager: null, has_lockfile: false, hint: "No dependency manifest found" };
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Handle check_drift MCP tool call.
 *
 * Runs all drift checks and returns a unified report with
 * overall status and actionable recommendations.
 *
 * @param args - Tool input: { cwd?: string }.
 * @returns Unified drift report.
 */
export function handleCheckDrift(
  args: Record<string, unknown>,
): CallToolResult {
  const cwd = (args.cwd as string | undefined) ?? process.cwd();

  const env = checkEnvDrift(cwd);
  const migrations = checkMigrationDrift(cwd);
  const deps = checkDepsDrift(cwd);

  // Build recommendations
  const recommendations: string[] = [];
  if (env.missing.length > 0) {
    recommendations.push(`Missing env vars: ${env.missing.join(", ")}. Copy from .env.example.`);
  }
  if (migrations.framework && migrations.hint.includes("check pending")) {
    recommendations.push(`${migrations.framework} detected. ${migrations.hint}`);
  }
  if (deps.manager && !deps.has_lockfile) {
    recommendations.push(deps.hint);
  }

  const drifted = env.missing.length > 0 || (!deps.has_lockfile && deps.manager !== null);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        status: drifted ? "drifted" : "clean",
        env: {
          present: env.present,
          missing: env.missing,
          extra: env.extra,
        },
        migrations: {
          framework: migrations.framework,
          hint: migrations.hint,
        },
        deps: {
          manager: deps.manager,
          has_lockfile: deps.has_lockfile,
          hint: deps.hint,
        },
        recommendations,
      }),
    }],
  };
}
