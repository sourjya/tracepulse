/**
 * Pre-spawn validation for start_server commands.
 *
 * Validates commands before attempting to spawn, catching common issues
 * that would cause silent failures. Returns actionable diagnostics.
 *
 * @see src/tools/start-server.ts for the tool handler
 * @see .kiro/specs/m21-zero-config/requirements.md Phase 2
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Validation result with diagnostics. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly diagnostics: Array<{ issue: string; fix: string }>;
}

/** Shell env var pattern: VAR=value at start of command. */
const SHELL_ENV_PATTERN = /^[A-Z_]+=\S+\s/;
/** Shell operators that don't work with spawn. */
const SHELL_META = /[;&|`$(){}!<>]/;

/**
 * Validate a start command before spawning.
 *
 * Checks for shell syntax, missing files, and common misconfigurations.
 * Returns diagnostics with specific fixes for each issue found.
 *
 * @param command - The command to validate.
 * @param cwd - Working directory (defaults to process.cwd()).
 * @returns Validation result with diagnostics array.
 */
export function validateStartCommand(command: string, cwd?: string): ValidationResult {
  const dir = cwd ?? process.cwd();
  const diagnostics: Array<{ issue: string; fix: string }> = [];

  // Shell env var syntax
  if (SHELL_ENV_PATTERN.test(command)) {
    const match = command.match(/^([A-Z_]+=\S+)\s+(.*)/);
    if (match) {
      diagnostics.push({
        issue: `"${match[1]}" is shell syntax. TracePulse spawns processes directly.`,
        fix: `Use env parameter: start_server({ command: "${match[2]}", env: { "${match[1].split("=")[0]}": "${match[1].split("=")[1]}" } })`,
      });
    }
  }

  // Shell operators
  if (SHELL_META.test(command)) {
    diagnostics.push({
      issue: `Command contains shell operators. TracePulse doesn't use a shell.`,
      fix: `Use cwd parameter instead of "cd dir &&", or wrap in: bash -c '${command}'`,
    });
  }

  // npm run without package.json
  if ((command.startsWith("npm run ") || command.startsWith("pnpm run ")) && !existsSync(resolve(dir, "package.json"))) {
    diagnostics.push({
      issue: `No package.json found. "${command}" requires a package.json with the script defined.`,
      fix: `Use the actual server command instead (e.g., "python manage.py runserver", "uvicorn main:app --reload").`,
    });
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
