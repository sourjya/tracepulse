/**
 * Doctor command - diagnostic checks for TracePulse installation.
 *
 * Runs a series of checks to verify the environment is correctly
 * configured: Node.js version, project detection, persistence,
 * port availability, etc. Used by `tracepulse doctor` CLI command.
 *
 * @see src/cli.ts for the doctor subcommand
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectProjectStacks, suggestStartCommands, hasVenv } from "@/diagnostics/project-detector.js";
import { VERSION } from "@/index.js";

/** Result of a single diagnostic check. */
export interface DoctorCheck {
  readonly name: string;
  readonly status: "pass" | "warn" | "fail";
  readonly message: string;
}

/**
 * Run all diagnostic checks for the current environment.
 *
 * @param cwd - Project directory to check.
 * @returns Array of check results.
 */
export function runDoctorChecks(cwd: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  // 1. TracePulse version
  checks.push({
    name: "TracePulse version",
    status: "pass",
    message: `v${VERSION}`,
  });

  // 2. Node.js version
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split(".")[0], 10);
  checks.push({
    name: "Node.js version",
    status: major >= 22 ? "pass" : major >= 18 ? "warn" : "fail",
    message: major >= 22
      ? `v${nodeVersion} (meets requirement)`
      : major >= 18
        ? `v${nodeVersion} (works but v22+ recommended)`
        : `v${nodeVersion} (requires v22+)`,
  });

  // 3. Project detection
  const stacks = detectProjectStacks(cwd);
  checks.push({
    name: "Project detection",
    status: stacks.length > 0 ? "pass" : "warn",
    message: stacks.length > 0
      ? `Detected: ${stacks.map(s => s.name).join(", ")}`
      : "No project markers found (empty directory or unrecognized project type)",
  });

  // 4. Start command suggestions
  const suggestions = suggestStartCommands(cwd);
  checks.push({
    name: "Start command",
    status: suggestions.length > 0 ? "pass" : "warn",
    message: suggestions.length > 0
      ? `Suggested: ${suggestions[0].command} (${suggestions[0].reason})`
      : "No start command detected. Use start_server() with your dev server command.",
  });

  // 5. Python venv (if Python project)
  if (stacks.some(s => s.name === "python")) {
    const venv = hasVenv(cwd);
    checks.push({
      name: "Python virtualenv",
      status: venv ? "pass" : "warn",
      message: venv
        ? ".venv/bin found (auto-activated in run_and_watch)"
        : "No .venv found. Create one: python -m venv .venv",
    });
  }

  // 6. Persistence directory
  const hasPersistence = existsSync(resolve(cwd, ".tracepulse"));
  checks.push({
    name: "Persistence",
    status: hasPersistence ? "pass" : "warn",
    message: hasPersistence
      ? ".tracepulse/ exists (cross-session patterns available)"
      : "No .tracepulse/ yet (created on first session shutdown)",
  });

  // 7. .gitignore includes .tracepulse
  const gitignorePath = resolve(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    const ignored = content.includes(".tracepulse");
    checks.push({
      name: ".gitignore",
      status: ignored ? "pass" : "warn",
      message: ignored
        ? ".tracepulse/ is gitignored"
        : "Add .tracepulse/ to .gitignore (contains session data)",
    });
  }

  return checks;
}

/**
 * Format doctor checks as a human-readable string for stderr.
 *
 * @param checks - Array of check results.
 * @returns Formatted string.
 */
export function formatDoctorOutput(checks: readonly DoctorCheck[]): string {
  const lines = [`TracePulse Doctor`, `${"=".repeat(40)}`, ""];
  for (const check of checks) {
    const icon = check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "✗";
    lines.push(`  ${icon} ${check.name}: ${check.message}`);
  }
  const passCount = checks.filter(c => c.status === "pass").length;
  const warnCount = checks.filter(c => c.status === "warn").length;
  const failCount = checks.filter(c => c.status === "fail").length;
  lines.push("");
  lines.push(`${passCount} passed, ${warnCount} warnings, ${failCount} failures`);
  return lines.join("\n");
}
