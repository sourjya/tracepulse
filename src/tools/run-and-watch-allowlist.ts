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

/** Commands always allowed regardless of stack. */
const BASE_PREFIXES = [
  "npx", "npm", "node", "tsc", "eslint", "vitest", "jest",
  "pnpm", "bun", "make", "cmake", "bash",
];

/** Stack-specific command prefixes. */
const STACK_PREFIXES: Record<string, string[]> = {
  python: [
    "python", "pytest", ".venv/bin/python", ".venv/bin/pytest",
    "uv", "uv run", "pip", "mypy", "ruff", "black", "flake8",
    "alembic", "django-admin",
  ],
  go: ["go test", "go run", "go build", "go vet"],
  rust: ["cargo test", "cargo build", "cargo run", "cargo check", "cargo clippy"],
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
