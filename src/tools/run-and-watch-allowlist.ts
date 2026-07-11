/**
 * Stack-aware allowlist builder for run_and_watch.
 *
 * Expands the command allowlist based on detected project stacks.
 * A Python project gets python/pytest/uv commands. A Go project gets
 * go test/run/build. Base commands (node, npx, npm) are always included.
 *
 * @see src/diagnostics/project-detector.ts for stack detection
 * @see .kiro/specs/m21-zero-config/requirements.md Phase 2
 */

import type { ProjectStack } from "@/diagnostics/project-detector.js";

/**
 * Commands always allowed regardless of detected stack.
 *
 * These are fundamental development commands that should never require
 * stack detection to use. Python/Go/Rust are as common as Node in
 * modern polyglot projects. The security boundary is the shell
 * metacharacter check + prefix matching — not stack detection.
 *
 * CIQ-605: Added python, python3, pytest, sh, .venv/bin/ to fix
 * forced shell fallback for Python projects.
 */
const BASE_PREFIXES = [
  // Node ecosystem
  "npx", "npm", "node", "tsc", "eslint", "vitest", "jest",
  "pnpm", "bun",
  // Python ecosystem — universal enough to be in base
  "python", "python3", "pytest", ".venv/bin/",
  "uv", "uv run",
  // Shell scripts
  "bash", "sh",
  // Build tools
  "make", "cmake",
  // Go ecosystem
  "go test", "go run", "go build", "go vet",
  // Rust ecosystem
  "cargo",
];

/**
 * Stack-specific command prefixes (additive to BASE_PREFIXES).
 *
 * Only includes commands NOT already covered by BASE_PREFIXES.
 * Stack detection enriches the allowlist with less common tools.
 */
const STACK_PREFIXES: Record<string, string[]> = {
  python: [
    // Less common Python tools that benefit from stack detection
    "pip", "mypy", "ruff", "black", "flake8",
    "alembic", "django-admin",
  ],
  go: [], // go test/run/build/vet now in BASE_PREFIXES
  rust: [], // cargo now in BASE_PREFIXES
  java: ["mvn", "gradle", "gradlew", "./gradlew", "java"],
  node: [], // base already covers node
  infra: [],
  docker: ["docker"],
};

/**
 * Build an allowlist of command prefixes based on detected stacks.
 *
 * @param stacks - Detected project stacks from detectProjectStacks().
 * @returns Deduplicated array of allowed command prefixes.
 */
export function buildAllowlist(stacks: readonly ProjectStack[]): string[] {
  const prefixes = new Set(BASE_PREFIXES);

  for (const stack of stacks) {
    const extras = STACK_PREFIXES[stack.name];
    if (extras) {
      for (const prefix of extras) {
        prefixes.add(prefix);
      }
    }
  }

  return [...prefixes];
}
