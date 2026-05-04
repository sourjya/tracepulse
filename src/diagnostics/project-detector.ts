/**
 * Project stack detector for zero-config startup.
 *
 * Scans the project directory for marker files (package.json, pyproject.toml,
 * go.mod, etc.) and detects which technology stacks are present. Also suggests
 * start commands by reading package.json scripts, Makefiles, and start scripts.
 *
 * Used by Layer 1 of the capability architecture to auto-configure parsers,
 * allowlists, and get_project_health suggestions.
 *
 * @see .kiro/specs/m21-zero-config/requirements.md Layer 1
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** A detected technology stack. */
export interface ProjectStack {
  /** Stack identifier. */
  readonly name: "node" | "python" | "go" | "rust" | "java" | "infra" | "docker";
  /** File that triggered detection. */
  readonly detected_by: string;
}

/** A suggested start command with confidence. */
export interface StartSuggestion {
  /** The command to run. */
  readonly command: string;
  /** Why this was suggested. */
  readonly reason: string;
  /** How confident we are: high (file explicitly defines it), medium (inferred), low (guess). */
  readonly confidence: "high" | "medium" | "low";
}

// ──────────────────────────────────────────────
// Stack Detection
// ──────────────────────────────────────────────

/** Marker files and their corresponding stacks. */
const STACK_MARKERS: Array<{ file: string; stack: ProjectStack["name"] }> = [
  { file: "package.json", stack: "node" },
  { file: "pyproject.toml", stack: "python" },
  { file: "requirements.txt", stack: "python" },
  { file: "setup.py", stack: "python" },
  { file: "go.mod", stack: "go" },
  { file: "Cargo.toml", stack: "rust" },
  { file: "pom.xml", stack: "java" },
  { file: "build.gradle", stack: "java" },
  { file: "build.gradle.kts", stack: "java" },
  { file: ".env", stack: "infra" },
  { file: "docker-compose.yml", stack: "docker" },
  { file: "docker-compose.yaml", stack: "docker" },
];

/**
 * Detect technology stacks present in a project directory.
 *
 * Scans root and one level deep for marker files. Returns all detected
 * stacks (a monorepo may have multiple). Deduplicates by stack name.
 *
 * @param cwd - Project root directory.
 * @returns Array of detected stacks.
 */
export function detectProjectStacks(cwd: string): ProjectStack[] {
  const found = new Map<string, ProjectStack>();

  // Check root level
  for (const marker of STACK_MARKERS) {
    if (existsSync(resolve(cwd, marker.file))) {
      if (!found.has(marker.stack)) {
        found.set(marker.stack, { name: marker.stack, detected_by: marker.file });
      }
    }
  }

  // Check one level deep (for monorepos: backend/, frontend/, packages/*)
  try {
    const entries = readdirSync(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip node_modules, .git, dist, etc.
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;

      for (const marker of STACK_MARKERS) {
        const path = join(cwd, entry.name, marker.file);
        if (existsSync(path) && !found.has(marker.stack)) {
          found.set(marker.stack, { name: marker.stack, detected_by: `${entry.name}/${marker.file}` });
        }
      }
    }
  } catch {
    // Directory read failed - skip subdirectory scan
  }

  return [...found.values()];
}

// ──────────────────────────────────────────────
// Start Command Suggestions
// ──────────────────────────────────────────────

/**
 * Suggest start commands based on project files.
 *
 * Reads package.json scripts, Makefiles, and start scripts to suggest
 * commands the agent can pass to start_server().
 *
 * @param cwd - Project root directory.
 * @returns Array of suggestions, most likely first.
 */
export function suggestStartCommands(cwd: string): StartSuggestion[] {
  const suggestions: StartSuggestion[] = [];

  // package.json scripts
  const pkgPath = resolve(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const scripts = pkg.scripts ?? {};
      if (scripts.dev) suggestions.push({ command: "npm run dev", reason: "package.json scripts.dev", confidence: "high" });
      else if (scripts.start) suggestions.push({ command: "npm run start", reason: "package.json scripts.start", confidence: "high" });
    } catch { /* malformed package.json */ }
  }

  // Makefile with dev target
  const makefilePath = resolve(cwd, "Makefile");
  if (existsSync(makefilePath)) {
    try {
      const content = readFileSync(makefilePath, "utf-8");
      if (/^dev\s*:/m.test(content)) {
        suggestions.push({ command: "make dev", reason: "Makefile has dev target", confidence: "high" });
      }
    } catch { /* unreadable */ }
  }

  // scripts/start.sh or scripts/dev.sh
  const scriptNames = ["start.sh", "dev.sh", "run.sh"];
  for (const name of scriptNames) {
    const scriptPath = resolve(cwd, "scripts", name);
    if (existsSync(scriptPath)) {
      suggestions.push({ command: `bash scripts/${name}`, reason: `scripts/${name} exists`, confidence: "high" });
    }
  }

  // manage.py (Django)
  if (existsSync(resolve(cwd, "manage.py"))) {
    suggestions.push({ command: "python manage.py runserver", reason: "Django manage.py detected", confidence: "high" });
  }

  // docker-compose.yml -> suggest compose mode
  if (existsSync(resolve(cwd, "docker-compose.yml")) || existsSync(resolve(cwd, "docker-compose.yaml"))) {
    suggestions.push({ command: "tracepulse compose", reason: "docker-compose.yml detected", confidence: "medium" });
  }

  // Python with uvicorn in requirements
  const reqPath = resolve(cwd, "requirements.txt");
  if (existsSync(reqPath) && suggestions.length === 0) {
    try {
      const content = readFileSync(reqPath, "utf-8");
      if (content.includes("uvicorn")) {
        suggestions.push({ command: "uvicorn main:app --reload", reason: "uvicorn in requirements.txt", confidence: "low" });
      } else if (content.includes("flask")) {
        suggestions.push({ command: "flask run --reload", reason: "flask in requirements.txt", confidence: "low" });
      }
    } catch { /* unreadable */ }
  }

  return suggestions;
}
