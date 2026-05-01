/**
 * Kiro steering file reader for project-aware defaults.
 *
 * On startup, scans for .kiro/steering/tech.md and extracts framework,
 * language, test runner, and database info. Used to customize diagnostics,
 * parser priority, and tool suggestions.
 *
 * @see docs/engineering/designs/kiro-steering-integration.md for design
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** Extracted project hints from steering files. */
export interface ProjectHints {
  readonly language?: string;
  readonly framework?: string;
  readonly testRunner?: string;
  readonly database?: string;
  readonly packageManager?: string;
  readonly buildTool?: string;
}

/** Patterns to extract from tech.md content. */
const PATTERNS: Array<{ key: keyof ProjectHints; patterns: RegExp[] }> = [
  {
    key: "language",
    patterns: [
      /(?:language|runtime|backend).*?:\s*(python|node\.?js|typescript|go|java|rust)/i,
      /\b(Python|Node\.js|TypeScript|Go|Java|Rust)\b.*(?:backend|server|runtime)/i,
    ],
  },
  {
    key: "framework",
    patterns: [
      /(?:framework|web framework).*?:\s*(fastapi|django|flask|express|next\.?js|spring boot|gin|echo)/i,
      /\b(FastAPI|Django|Flask|Express|Next\.js|Spring Boot|Gin|Echo)\b/,
    ],
  },
  {
    key: "testRunner",
    patterns: [
      /(?:test runner|testing).*?:\s*(pytest|vitest|jest|go test|cargo test|junit)/i,
      /\b(pytest|vitest|jest)\b.*(?:test|testing)/i,
    ],
  },
  {
    key: "database",
    patterns: [
      /(?:database|db).*?:\s*(postgresql|postgres|mysql|sqlite|mongodb|redis)/i,
      /\b(PostgreSQL|MySQL|SQLite|MongoDB|Redis)\b/i,
    ],
  },
  {
    key: "packageManager",
    patterns: [
      /(?:package manager|dependencies).*?:\s*(npm|pnpm|yarn|uv|pip|poetry)/i,
    ],
  },
  {
    key: "buildTool",
    patterns: [
      /(?:build|bundler).*?:\s*(vite|webpack|tsup|esbuild|rollup)/i,
    ],
  },
];

/**
 * Read Kiro steering files and extract project hints.
 *
 * Scans .kiro/steering/tech.md for framework, language, test runner, etc.
 * Returns empty hints if no steering files found (non-Kiro project).
 *
 * @param cwd - Project root directory.
 * @returns Extracted project hints.
 */
export function readProjectHints(cwd: string): ProjectHints {
  const techPath = resolve(cwd, ".kiro", "steering", "tech.md");

  if (!existsSync(techPath)) {
    // Also check user-project-overrides.md (common in Kiro projects)
    const overridesPath = resolve(cwd, ".kiro", "steering", "user-project-overrides.md");
    if (!existsSync(overridesPath)) return {};
    return extractHints(readFileSync(overridesPath, "utf-8"));
  }

  return extractHints(readFileSync(techPath, "utf-8"));
}

/**
 * Extract hints from markdown content using pattern matching.
 *
 * @param content - Markdown file content.
 * @returns Extracted hints.
 */
function extractHints(content: string): ProjectHints {
  const hints: Record<string, string> = {};

  for (const { key, patterns } of PATTERNS) {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        hints[key] = match[1];
        break;
      }
    }
  }

  return hints as ProjectHints;
}
