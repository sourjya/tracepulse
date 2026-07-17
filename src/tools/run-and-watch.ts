/**
 * MCP tool handler for run_and_watch.
 *
 * Spawns a command, pipes output through the parser pipeline, waits for
 * exit, returns structured results. Replaces: shell command + manual log reading.
 *
 * Use cases: run tests, run type checker, run linter, run any command
 * and get parsed, scored results back.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve as resolvePath } from "node:path";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createDefaultRegistry } from "@/pipeline/parser-registry.js";
import { existsSync } from "node:fs";
import { hasVenv, isPythonProject, getVenvBinPath } from "@/diagnostics/project-detector.js";
import { processRawLine } from "@/pipeline/process-line.js";
import { redact } from "@/pipeline/secret-redactor.js";
import { extractTestCounts } from "@/tools/test-counts.js";
import { getPositiveNudge } from "@/analysis/positive-nudge.js";

/**
 * Generate a diagnostic hint when a command fails.
 * Detects missing tools and suggests installation steps.
 *
 * @param command - The command that failed.
 * @param exitCode - The exit code (127 = not found).
 * @param cwd - Working directory the command ran in.
 * @returns Diagnostic string, or undefined if no hint available.
 */
function diagnoseFailure(command: string, exitCode: number | null, cwd?: string): string | undefined {
  const dir = cwd ?? process.cwd();
  const cmdLower = command.toLowerCase();

  // Command not found (exit 127) or Python import errors
  if (exitCode === 127 || cmdLower.includes("pytest") || cmdLower.includes("python")) {
    const hasVenvDir = hasVenv(dir);
    const isPython = isPythonProject(dir);

    if (isPython && !hasVenvDir) {
      return "Python project detected but no .venv/ found. Create one: python -m venv .venv && .venv/bin/pip install -e '.[dev]'";
    }
    if (isPython && hasVenvDir && cmdLower.includes("pytest")) {
      return "pytest not found on system PATH. Use the venv binary directly: run_and_watch('.venv/bin/pytest tests/')";
    }
    if (isPython && hasVenvDir) {
      return "Command failed. Try using the venv binary: .venv/bin/python -m <module>";
    }
  }

  if (exitCode === 127) {
    return `Command not found. Verify it is installed and on PATH.`;
  }

  return undefined;
}

import { buildAllowlist } from "@/tools/run-and-watch-allowlist.js";

/** Fallback allowlist when no stack-aware list is provided. */
const DEFAULT_ALLOWED_PREFIXES = buildAllowlist([]);

/**
 * Handle run_and_watch MCP tool call.
 *
 * @param args - { command: string, timeout_seconds?: number, cwd?: string }.
 * @param allowedPrefixes - Optional custom allowlist. Defaults to DEFAULT_ALLOWED_PREFIXES.
 * @param mainBuffer - Optional main event buffer. When provided, error-level events are
 *   pushed into it so they persist beyond this tool call and appear in get_errors.
 */
export async function handleRunAndWatch(
  args: Record<string, unknown>,
  allowedPrefixes?: readonly string[],
  mainBuffer?: import("@/types/collectors.js").EventBuffer,
): Promise<CallToolResult> {
  const command = args.command as string | undefined;
  const cwd = args.cwd as string | undefined;
  if (!command) {
    return { content: [{ type: "text", text: "command parameter is required" }], isError: true };
  }

  // Security: validate command against allowlist (stack-aware when available)
  // Strip leading env var assignments (KEY=val) before checking - they don't work
  // with child_process.spawn anyway and should use the `env` parameter instead.
  const ENV_VAR_PREFIX = /^(?:[A-Z_][A-Z0-9_]*=[^\s]*\s+)+/i;
  const envMatch = command.trim().match(ENV_VAR_PREFIX);
  const cmdForCheck = envMatch ? command.trim().slice(envMatch[0].length) : command.trim();
  const cmdLower = cmdForCheck.toLowerCase();
  const prefixes = allowedPrefixes ?? DEFAULT_ALLOWED_PREFIXES;
  const allowed = prefixes.some((prefix) =>
    cmdLower.startsWith(prefix.toLowerCase()),
  );
  if (!allowed) {
    // Build a helpful suggestion based on what the agent tried
    const suggestions: string[] = [];
    const cmdFirst = cmdForCheck.split(/\s+/)[0].toLowerCase();

    // Python command hints
    if (cmdFirst.includes("python") || cmdFirst.includes("pytest") || cmdFirst.includes("mypy") || cmdFirst.includes("ruff")) {
      suggestions.push(
        `Hint: Python commands are supported directly. Try: run_and_watch("pytest tests/", cwd: "/path/to/backend")`,
        `TracePulse auto-activates .venv/ if present in the working directory — no .venv/bin/ prefix needed.`,
      );
    }
    // If command starts with a path (e.g., .venv/bin/something or /usr/bin/something)
    else if (cmdFirst.startsWith(".") || cmdFirst.startsWith("/")) {
      suggestions.push(
        `Hint: Use the command name directly with cwd parameter. TracePulse auto-activates .venv/ in the working directory.`,
        `Example: run_and_watch("pytest tests/", cwd: "./backend")`,
      );
    }
    // Generic suggestion
    else {
      // Find the closest matching prefix
      const partial = prefixes.filter((p) => p.toLowerCase().startsWith(cmdFirst.slice(0, 3)));
      if (partial.length > 0) {
        suggestions.push(`Did you mean: ${partial.join(", ")}?`);
      }
    }

    // Always show the top relevant prefixes, not the full list
    const relevantPrefixes = prefixes.slice(0, 15).join(", ");
    suggestions.push(`Allowed prefixes include: ${relevantPrefixes}, ...`);

    return {
      content: [{
        type: "text",
        text: `Command "${cmdForCheck.slice(0, 60)}" not in allowlist. ${suggestions.join(" ")}`,
      }],
      isError: true,
    };
  }
  // Warn if env vars were inline - suggest the env parameter instead
  if (envMatch) {
    const vars = envMatch[0].trim().split(/\s+/).map(v => v.split("="));
    const envHint = vars.map(([k, v]) => `${k}: "${v}"`).join(", ");
    process.stderr.write(`[tracepulse] Hint: move inline env vars to the env parameter: run_and_watch("${cmdForCheck.trim()}", env: {${envHint}})\n`);
  }

  // Security: reject shell metacharacters to prevent command chaining
  const SHELL_META = /[;&|`$(){}!<>]/;
  if (SHELL_META.test(command)) {
    return {
      content: [{
        type: "text",
        text: `Command contains shell metacharacters (;, &, |, \`, $, etc.) which are not allowed. Run one command at a time. Use the cwd parameter instead of "cd dir && command".`,
      }],
      isError: true,
    };
  }

  const timeout = ((args.timeout_seconds as number | undefined) ?? 60) * 1000;
  const maxLines = args.max_lines as number | undefined;

  // Security: validate cwd. Allow absolute paths (explicit user intent).
  // For relative paths, ensure they don't escape the project root.
  let resolvedCwd: string | undefined;
  if (cwd) {
    const projectRoot = process.cwd();
    const resolved = resolvePath(projectRoot, cwd);
    // Reject relative paths that escape project root (path traversal)
    // Allow absolute paths (user explicitly chose a directory)
    const isAbsolute = cwd.startsWith("/");
    if (!isAbsolute && !resolved.startsWith(projectRoot)) {
      return {
        content: [{
          type: "text",
          text: `cwd must be within the project root or an absolute path. "${cwd}" resolves outside ${projectRoot}. Use an absolute path like "/home/user/other-project" instead.`,
        }],
        isError: true,
      };
    }
    resolvedCwd = resolved;
  }
  const tempBuffer = createRingBuffer(200);
  const registry = createDefaultRegistry();

  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;
    let timedOut = false;

    // Build environment: inherit process.env, add Python unbuffered mode,
    // and auto-detect virtualenv in the working directory (M21 Phase 2).
    const spawnEnv: Record<string, string | undefined> = { ...process.env, PYTHONUNBUFFERED: "1", FORCE_COLOR: "0" };
    const spawnCwd = resolvedCwd ?? process.cwd();

    // Auto-activate virtualenv if .venv exists in the working directory.
    // MCP servers don't inherit the user's shell profile, so venvs activated
    // in the terminal aren't active here. This fixes the env mismatch.
    const venvBin = getVenvBinPath(spawnCwd);
    if (venvBin) {
      spawnEnv.PATH = `${venvBin}:${spawnEnv.PATH ?? ""}`;
      spawnEnv.VIRTUAL_ENV = resolvePath(spawnCwd, ".venv");
      process.stderr.write(`[tracepulse] Using .venv from ${spawnCwd} (auto-activated)\n`);
    }

    // Auto-add node_modules/.bin to PATH for Node.js projects.
    // Same issue as venv: MCP servers don't inherit nvm/npx from user's shell.
    // Without this, commands like "vite", "vitest", "tsc" fail with ENOENT.
    const nodeModulesBin = resolvePath(spawnCwd, "node_modules", ".bin");
    if (existsSync(nodeModulesBin)) {
      spawnEnv.PATH = `${nodeModulesBin}:${spawnEnv.PATH ?? ""}`;
    }

    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // Create process group so we can kill the entire tree on timeout
      env: spawnEnv,
      ...(resolvedCwd ? { cwd: resolvedCwd } : {}),
    });

    /** Collect raw output lines for the raw_output field. */
    const rawLines: string[] = [];

    /** Process a line through the shared pipeline into the temp buffer. */
    function processLine(line: string, source: "server-stdout" | "server-stderr"): void {
      rawLines.push(line);
      const event = processRawLine(line, source, registry);
      tempBuffer.push(event);
    }

    if (child.stdout) {
      createInterface({ input: child.stdout }).on("line", (l) => processLine(l, "server-stdout"));
    }
    if (child.stderr) {
      createInterface({ input: child.stderr }).on("line", (l) => processLine(l, "server-stderr"));
    }

    function finish(exitCode: number | null): void {
      if (resolved) return;
      resolved = true;

      const allEvents = tempBuffer.query({});
      const errors = allEvents.filter((e) => e.level === "error" || e.level === "warn");

      // Push errors to main buffer so they persist for get_errors (W9: longer retention)
      if (mainBuffer && errors.length > 0) {
        for (const err of errors) {
          mainBuffer.push(err);
        }
      }

      // Extract test summary from info-level events (pytest/vitest/jest/cargo/junit summaries)
      const testSummary = allEvents
        .filter((e) => e.level === "info" && /(?:pytest|vitest|jest|cargo test|junit):/i.test(e.message))
        .map((e) => e.message)
        .slice(-1)[0]; // last summary line

      // Extract structured test counts from the summary string
      const testCounts = testSummary ? extractTestCounts(testSummary) : null;

      resolve({
        content: [{
          type: "text",
          text: JSON.stringify({
            exit_code: exitCode,
            success: exitCode === 0,
            duration_ms: Date.now() - startTime,
            total_events: allEvents.length,
            error_count: errors.length,
            errors: errors.slice(0, 10),
            ...(testSummary ? { test_summary: testSummary } : {}),
            ...(testCounts ? { test_counts: testCounts } : {}),
            summary: exitCode === 0
              ? `Command succeeded in ${Date.now() - startTime}ms, ${errors.length} warnings`
              : timedOut
                ? `Command timed out after ${timeout / 1000}s. Increase with timeout_seconds: ${Math.ceil(timeout / 1000 * 2)}`
                : `Command failed (exit ${exitCode}) in ${Date.now() - startTime}ms, ${errors.length} errors`,
            // Surface venv auto-activation so agents know it happened
            ...(venvBin ? { venv_activated: spawnCwd } : {}),
            // Positive reinforcement: one-time nudge on first successful use
            ...(exitCode === 0 ? (() => {
              const tip = getPositiveNudge("run_and_watch");
              return tip ? { _tip: tip } : {};
            })() : {}),
            ...(exitCode !== 0 ? (() => {
              const hint = diagnoseFailure(command!, exitCode, process.cwd());
              return hint ? { diagnostic: hint } : {};
            })() : {}),
            // Raw output with optional truncation (max_lines parameter)
            // Safety: cap raw_output at 32KB to prevent oversized MCP responses
            // that exceed stdio transport buffer limits (INB-10).
            raw_output: (() => {
              // TM-03 / TRP-54: redact secrets from raw_output before returning
              // it to the agent. errors[] are already redacted via the pipeline;
              // raw_output was previously returned verbatim, leaking any secret a
              // command printed straight into the agent's context.
              const selected = maxLines
                ? rawLines.slice(0, maxLines)
                : rawLines.slice(-100);
              let output = selected.map(redact).join("\n");
              if (output.length > 32_000) {
                output = output.slice(0, 32_000) + "\n... [truncated: output exceeded 32KB safety limit]";
              }
              return output;
            })(),
            ...(maxLines && rawLines.length > maxLines ? { output_truncated: true, total_lines: rawLines.length } : {}),
          }),
        }],
      });
    }

    child.on("exit", (code) => finish(code));
    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      resolve({
        content: [{ type: "text", text: `Failed to run command: ${err.message}` }],
        isError: true,
      });
    });

    const timer = setTimeout(() => {
      if (resolved) return;
      // Kill the entire process group (shell + children like pytest/vitest).
      // With shell: true, child.kill() only kills the shell wrapper, leaving
      // the actual command running as an orphan. process.kill(-pid) sends
      // SIGTERM to the entire process group created by detached: true.
      try {
        if (child.pid) process.kill(-child.pid, "SIGTERM");
      } catch {
        try { child.kill("SIGTERM"); } catch {}
      }
      // Mark as timed out so finish() can report it clearly
      timedOut = true;
      // Force-resolve after 3s if the process group doesn't exit cleanly
      setTimeout(() => {
        if (!resolved) {
          try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch {}
          finish(null);
        }
      }, 3000);
    }, timeout);

    if (typeof timer === "object" && "unref" in timer) timer.unref();
  });
}
