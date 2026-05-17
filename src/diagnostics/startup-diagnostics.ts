/**
 * Startup diagnostics for TracePulse.
 *
 * When the dev server command fails to start, this module analyzes the
 * command, environment, and project structure to produce actionable
 * recommendations. Goal: the user should never have to guess why
 * TracePulse failed - the error message tells them exactly what to fix.
 *
 * @see src/cli.ts for the auto-fallback path that calls this
 */

import { hasVenv, hasPackageJson, hasProjectFile } from "@/diagnostics/project-detector.js";

/** A single diagnostic finding with severity and fix. */
export interface DiagnosticFinding {
  readonly issue: string;
  readonly fix: string;
  readonly severity: "error" | "warning" | "info";
}

/**
 * Diagnose why a start command failed.
 *
 * Checks for common issues: shell syntax in args, missing commands,
 * missing venvs, missing package.json scripts, wrong Python paths.
 *
 * @param command - The command that was attempted.
 * @param errorMessage - The error message from the failure.
 * @param cwd - Working directory.
 * @returns Array of diagnostic findings, most important first.
 */
export function diagnoseStartupFailure(
  command: string,
  errorMessage: string,
  cwd: string = process.cwd(),
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];

  // ── Shell syntax in command ──
  // VAR=value cmd doesn't work with spawn (not a shell)
  if (/^[A-Z_]+=\S+\s/.test(command)) {
    const match = command.match(/^([A-Z_]+=\S+)\s+(.*)/);
    if (match) {
      findings.push({
        issue: `"${match[1]}" is shell syntax. TracePulse spawns processes directly, not through a shell.`,
        fix: `Move the env var to the MCP config's "env" field: { "env": { "${match[1].split("=")[0]}": "${match[1].split("=")[1]}" } } and use command: "${match[2]}"`,
        severity: "error",
      });
    }
  }

  // ── Shell operators in command ──
  if (/[;&|]/.test(command)) {
    findings.push({
      issue: `Command contains shell operators (${command.match(/[;&|]/)?.[0]}). TracePulse doesn't use a shell.`,
      fix: `Wrap in bash: "bash -c '${command}'" or split into separate services.`,
      severity: "error",
    });
  }

  // ── npm/pnpm script doesn't exist ──
  if (command.startsWith("npm run ") || command.startsWith("pnpm run ")) {
    const script = command.split(" ")[2];
    if (!hasPackageJson(cwd)) {
      findings.push({
        issue: `No package.json found in ${cwd}. "${command}" needs a package.json with a "${script}" script.`,
        fix: `Use the actual server command instead: "python manage.py runserver", "uvicorn main:app --reload", etc.`,
        severity: "error",
      });
    }
  }

  // ── Python module not found ──
  if (errorMessage.includes("ModuleNotFoundError") || errorMessage.includes("No module named")) {
    const moduleMatch = errorMessage.match(/No module named '([^']+)'/);
    const moduleName = moduleMatch?.[1] ?? "unknown";

    // Check for venv
    const hasVenvDir = hasVenv(cwd);
    if (hasVenvDir && !command.includes(".venv/")) {
      findings.push({
        issue: `Python module "${moduleName}" not found. A .venv/ exists but the command uses system Python.`,
        fix: `Use the venv Python: ".venv/bin/python -m ${command.replace(/^python\s+-m\s+/, "")}" or install deps: .venv/bin/pip install -r requirements.txt`,
        severity: "error",
      });
    } else if (!hasVenvDir) {
      findings.push({
        issue: `Python module "${moduleName}" not installed. No .venv/ found.`,
        fix: `Install dependencies: pip install ${moduleName} (or create a venv: python -m venv .venv && .venv/bin/pip install -r requirements.txt)`,
        severity: "error",
      });
    }
  }

  // ── Command not found (exit 127) ──
  if (errorMessage.includes("ENOENT") || errorMessage.includes("not found") || errorMessage.includes("exit code 127")) {
    const cmd = command.split(" ")[0];
    findings.push({
      issue: `Command "${cmd}" not found on PATH.`,
      fix: `Install ${cmd} or use the full path. For Python: use ".venv/bin/python" instead of "python".`,
      severity: "error",
    });
  }

  // ── Python PYTHONPATH likely needed ──
  if (command.includes("python -m ") && !command.includes("PYTHONPATH") && errorMessage.includes("ModuleNotFoundError")) {
    const hasSrcDir = hasProjectFile(cwd, "src");
    if (hasSrcDir) {
      findings.push({
        issue: `Python module import failed. The project has a src/ directory that may need to be on PYTHONPATH.`,
        fix: `Add to MCP config: "env": { "PYTHONPATH": "src" }`,
        severity: "warning",
      });
    }
  }

  // ── Port already in use ──
  if (errorMessage.includes("EADDRINUSE") || errorMessage.includes("Address already in use")) {
    const portMatch = errorMessage.match(/port (\d+)/i) ?? errorMessage.match(/:(\d+)/);
    findings.push({
      issue: `Port ${portMatch?.[1] ?? "unknown"} is already in use.`,
      fix: `Stop the existing server or use a different port.`,
      severity: "error",
    });
  }

  // ── Generic: suggest bash wrapper for complex commands ──
  if (findings.length === 0 && hasProjectFile(cwd, "scripts")) {
    findings.push({
      issue: `Command failed. The project has a scripts/ directory.`,
      fix: `Try wrapping in bash: "bash scripts/start.sh" (or whatever your start script is).`,
      severity: "info",
    });
  }

  // ── Always: suggest standalone as fallback ──
  if (findings.length > 0) {
    findings.push({
      issue: `TracePulse fell back to standalone mode. Tools work but no passive error monitoring.`,
      fix: `Fix the command above, or use "tracepulse standalone" if you don't need a dev server.`,
      severity: "info",
    });
  }

  return findings;
}

/**
 * Format diagnostic findings as a human-readable string for stderr.
 *
 * @param findings - Diagnostic findings to format.
 * @returns Formatted string with emoji severity indicators.
 */
export function formatDiagnostics(findings: readonly DiagnosticFinding[]): string {
  if (findings.length === 0) return "";

  const lines = ["\n[tracepulse] Startup diagnostics:"];
  for (const f of findings) {
    const icon = f.severity === "error" ? "✗" : f.severity === "warning" ? "!" : "i";
    lines.push(`  ${icon} ${f.issue}`);
    lines.push(`    Fix: ${f.fix}`);
  }
  return lines.join("\n") + "\n";
}
