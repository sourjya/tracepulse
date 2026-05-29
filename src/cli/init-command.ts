/**
 * tracepulse init command - context-aware project setup.
 *
 * Detects the MCP client, writes/merges config, installs steering + hooks + prompts.
 * Checks for version updates and manages .gitignore.
 *
 * Borrowed patterns from ViewGraph's init:
 * - MCP config merging (not skip-if-exists)
 * - npm registry version check with timeout
 * - .gitignore management for .tracepulse/
 * - Prompt shortcut installation
 *
 * @see .kiro/specs/m23-init-command/requirements.md
 */

import { existsSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, readFileSync, appendFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Check if source file differs from destination (content-based).
 * Mtime comparison is unreliable because agent edits or npm install timing
 * can make the dest newer than source even when source has the canonical content.
 */
function shouldCopyFile(src: string, dest: string): boolean {
  if (!existsSync(dest)) return true;
  try {
    return readFileSync(src, "utf8") !== readFileSync(dest, "utf8");
  } catch { return true; }
}

/**
 * Read and parse a JSON file, returning empty object on failure.
 */
function readJsonSafe(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch { return {}; }
}

/**
 * Merge tracepulse into an existing MCP config file.
 * Preserves all other mcpServers entries. Creates file if missing.
 */
function mergeMcpConfig(configPath: string, actions: string[]): void {
  const existing = readJsonSafe(configPath);
  const mcpServers = (existing.mcpServers ?? {}) as Record<string, unknown>;
  const hadTracepulse = "tracepulse" in mcpServers;

  mcpServers.tracepulse = { command: "tracepulse" };
  existing.mcpServers = mcpServers;

  const newContent = JSON.stringify(existing, null, 2) + "\n";
  const oldContent = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";

  if (newContent !== oldContent) {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, newContent);
    actions.push(hadTracepulse
      ? `Updated tracepulse in ${relative(process.cwd(), configPath)}`
      : `Added tracepulse to ${relative(process.cwd(), configPath)}`);
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/** Supported MCP clients. */
export type McpClient = "kiro" | "claude" | "cursor" | "generic";

/**
 * Detect which MCP client is being used in this project.
 *
 * @param cwd - Project directory.
 * @returns Detected client type.
 */
export function detectMcpClient(cwd: string): McpClient {
  if (existsSync(resolve(cwd, ".kiro"))) return "kiro";
  if (existsSync(resolve(cwd, ".claude"))) return "claude";
  if (existsSync(resolve(cwd, ".cursor"))) return "cursor";
  return "generic";
}

/**
 * Get the path to TracePulse's installed skills directory.
 * Works from both source (src/) and dist (dist/).
 */
function getSkillsDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  for (const rel of ["../skills", "../../skills"]) {
    const candidate = resolve(__dirname, rel);
    if (existsSync(candidate)) return candidate;
  }
  return resolve(__dirname, "../../skills");
}

/**
 * Check npm registry for newer version. Non-blocking with 3s timeout.
 * Returns a warning string if outdated, null otherwise.
 */
export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  try {
    const res = await fetch("https://registry.npmjs.org/tracepulse/latest", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    if (data.version && data.version !== currentVersion && data.version > currentVersion) {
      return `TracePulse ${data.version} available (you have ${currentVersion}). Run: npm update -g tracepulse`;
    }
  } catch { /* offline or timeout - skip silently */ }
  return null;
}

/**
 * Add .tracepulse/ to .gitignore if not already present.
 * Creates .gitignore if it doesn't exist.
 */
function manageGitignore(cwd: string, actions: string[]): void {
  const gitignorePath = resolve(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf8");
    if (!content.includes(".tracepulse")) {
      appendFileSync(gitignorePath, "\n# TracePulse - session data, fingerprints\n.tracepulse/\n");
      actions.push("Updated .gitignore (added .tracepulse/)");
    }
  } else {
    writeFileSync(gitignorePath, "# TracePulse - session data, fingerprints\n.tracepulse/\n");
    actions.push("Created .gitignore (added .tracepulse/)");
  }
}

/**
 * Install prompt shortcuts to .kiro/prompts/ from skills/kiro-prompts/.
 */
function installPrompts(cwd: string, skillsDir: string, actions: string[]): void {
  const srcPrompts = resolve(skillsDir, "kiro-prompts");
  if (!existsSync(srcPrompts)) return;

  const promptsDest = resolve(cwd, ".kiro", "prompts");
  mkdirSync(promptsDest, { recursive: true });

  for (const file of readdirSync(srcPrompts).filter(f => f.startsWith("tp-"))) {
    const src = resolve(srcPrompts, file);
    const dest = resolve(promptsDest, file);
    if (shouldCopyFile(src, dest)) {
      copyFileSync(src, dest);
      actions.push(`Installed prompt: ${file}`);
    }
  }
}

/**
 * Run the init command for a specific client.
 *
 * @param client - Target MCP client (or auto-detect).
 * @param cwd - Project directory.
 * @returns Array of actions taken.
 */
export function runInit(client: McpClient | "auto", cwd: string): string[] {
  const detected = client === "auto" ? detectMcpClient(cwd) : client;
  const actions: string[] = [];
  const skillsDir = getSkillsDir();

  switch (detected) {
    case "claude": {
      // Layer 1: Global rules (auto-loaded every session)
      const rulesDir = resolve(process.env.HOME ?? "~", ".claude", "rules");
      const rulesFile = resolve(rulesDir, "tracepulse.md");
      const sourceRules = resolve(skillsDir, "claude-rules", "tracepulse.md");

      if (existsSync(sourceRules)) {
        mkdirSync(rulesDir, { recursive: true });
        copyFileSync(sourceRules, rulesFile);
        actions.push(`Wrote ${rulesFile} (auto-loaded every session)`);
      }

      // Layer 2: Slash commands (on-demand)
      const commandsDir = resolve(cwd, ".claude", "commands");
      const claudeMd = resolve(skillsDir, "CLAUDE.md");
      if (existsSync(claudeMd)) {
        mkdirSync(commandsDir, { recursive: true });
        copyFileSync(claudeMd, resolve(commandsDir, "tracepulse.md"));
        actions.push(`Wrote .claude/commands/tracepulse.md (/tracepulse slash command)`);
      }

      // MCP config merging
      mergeMcpConfig(resolve(cwd, ".claude", "mcp.json"), actions);
      break;
    }

    case "kiro": {
      // MCP config - merge, don't skip
      mergeMcpConfig(resolve(cwd, ".kiro", "settings", "mcp.json"), actions);

      // Steering + hook files (content-based comparison)
      const steeringDest = resolve(cwd, ".kiro", "steering");
      const hooksDest = resolve(cwd, ".kiro", "hooks");
      const steeringSrc = resolve(skillsDir, "kiro-steering");
      if (existsSync(steeringSrc)) {
        mkdirSync(steeringDest, { recursive: true });
        mkdirSync(hooksDest, { recursive: true });
        for (const file of readdirSync(steeringSrc).filter(f => f.endsWith(".md") || f.endsWith(".kiro.hook"))) {
          const src = resolve(steeringSrc, file);
          const destDir = file.endsWith(".kiro.hook") ? hooksDest : steeringDest;
          const dest = resolve(destDir, file);
          if (shouldCopyFile(src, dest)) {
            copyFileSync(src, dest);
            actions.push(`Installed ${file.endsWith(".kiro.hook") ? "hook" : "steering"}: ${file}`);
          }
        }
      }

      // Prompt shortcuts
      installPrompts(cwd, skillsDir, actions);
      break;
    }

    case "cursor": {
      mergeMcpConfig(resolve(cwd, ".cursor", "mcp.json"), actions);
      break;
    }

    default: {
      mergeMcpConfig(resolve(cwd, ".mcp.json"), actions);
      break;
    }
  }

  // .gitignore management (all clients)
  manageGitignore(cwd, actions);

  return actions;
}
