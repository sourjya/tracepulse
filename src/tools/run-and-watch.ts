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
import type { RuntimeEvent } from "@/types/events.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createDefaultRegistry } from "@/pipeline/parser-registry.js";
import { redact } from "@/pipeline/secret-redactor.js";
import { normalizeEvent, normalizeRawLine } from "@/pipeline/event-normalizer.js";
import { ANSI_ESCAPE_REGEX, MAX_PARSE_INPUT_LENGTH } from "@/constants/limits.js";
import { existsSync } from "node:fs";
import { hasVenv, isPythonProject, getVenvBinPath } from "@/diagnostics/project-detector.js";

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

/** Default allowed command prefixes. Only these can be executed. */
const DEFAULT_ALLOWED_PREFIXES = [
  "npx", "npm", "node", "pytest", "python", "tsc", "eslint",
  "vitest", "jest", "go test", "cargo test", "cargo build", "cargo check",
  "uv", "uv run", "pnpm", "bun",
  ".venv/bin/python", ".venv/bin/pytest",
  "mvn", "gradle", "gradlew", "./gradlew",
  "make", "cmake",
];

/**
 * Handle run_and_watch MCP tool call.
 *
 * @param args - { command: string, timeout_seconds?: number, cwd?: string }.
 * @param allowedPrefixes - Optional custom allowlist. Defaults to DEFAULT_ALLOWED_PREFIXES.
 */
export async function handleRunAndWatch(
  args: Record<string, unknown>,
  allowedPrefixes?: readonly string[],
): Promise<CallToolResult> {
  const command = args.command as string | undefined;
  const cwd = args.cwd as string | undefined;
  if (!command) {
    return { content: [{ type: "text", text: "command parameter is required" }], isError: true };
  }

  // Security: validate command against allowlist (stack-aware when available)
  const cmdLower = command.trim().toLowerCase();
  const prefixes = allowedPrefixes ?? DEFAULT_ALLOWED_PREFIXES;
  const allowed = prefixes.some((prefix) =>
    cmdLower.startsWith(prefix.toLowerCase()),
  );
  if (!allowed) {
    return {
      content: [{
        type: "text",
        text: `Command not allowed. Must start with one of: ${DEFAULT_ALLOWED_PREFIXES.join(", ")}. This restriction prevents arbitrary shell execution.`,
      }],
      isError: true,
    };
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

  // Security: validate cwd is within the project root (no directory traversal)
  let resolvedCwd: string | undefined;
  if (cwd) {
    const projectRoot = process.cwd();
    const resolved = resolvePath(projectRoot, cwd);
    if (!resolved.startsWith(projectRoot)) {
      return {
        content: [{
          type: "text",
          text: `cwd must be within the project root. "${cwd}" resolves outside ${projectRoot}.`,
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
    }

    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: spawnEnv,
      ...(resolvedCwd ? { cwd: resolvedCwd } : {}),
    });

    /** Collect raw output lines for the raw_output field. */
    const rawLines: string[] = [];

    /** Process a line through the parser pipeline into the temp buffer. */
    function processLine(line: string, source: "server-stdout" | "server-stderr"): void {
      rawLines.push(line);
      const stripped = line.replace(ANSI_ESCAPE_REGEX, "");
      const redacted = redact(stripped);
      const parseInput = redacted.length > MAX_PARSE_INPUT_LENGTH
        ? redacted.slice(0, MAX_PARSE_INPUT_LENGTH) : redacted;
      const parsed = registry.parse(parseInput);
      const event = parsed
        ? normalizeEvent(parsed, redacted, source, true)
        : normalizeRawLine(redacted, source);
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

      // Extract test summary from info-level events (pytest/vitest/jest/cargo/junit summaries)
      const testSummary = allEvents
        .filter((e) => e.level === "info" && /(?:pytest|vitest|jest|cargo test|junit):/i.test(e.message))
        .map((e) => e.message)
        .slice(-1)[0]; // last summary line

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
            summary: exitCode === 0
              ? `Command succeeded in ${Date.now() - startTime}ms, ${errors.length} warnings`
              : `Command failed (exit ${exitCode}) in ${Date.now() - startTime}ms, ${errors.length} errors`,
            ...(exitCode !== 0 ? (() => {
              const hint = diagnoseFailure(command!, exitCode, process.cwd());
              return hint ? { diagnostic: hint } : {};
            })() : {}),
            // Raw output with optional truncation (max_lines parameter)
            raw_output: maxLines
              ? rawLines.slice(0, maxLines).join("\n")
              : rawLines.slice(-100).join("\n"), // default: last 100 lines
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
      try { child.kill("SIGTERM"); } catch {}
      finish(null);
    }, timeout);

    if (typeof timer === "object" && "unref" in timer) timer.unref();
  });
}
