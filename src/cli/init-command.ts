/**
 * tracepulse init command - context-aware project setup.
 *
 * Detects the MCP client, writes config + skills to the right locations.
 * For Claude Code: writes ~/.claude/rules/tracepulse.md (auto-loaded)
 * and optionally .claude/commands/ (slash commands).
 *
 * @see .kiro/specs/m23-init-command/requirements.md
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  // In dist/: ../skills. In src/: ../../skills
  for (const rel of ["../skills", "../../skills"]) {
    const candidate = resolve(__dirname, rel);
    if (existsSync(candidate)) return candidate;
  }
  return resolve(__dirname, "../../skills");
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
      break;
    }

    case "kiro": {
      // Kiro auto-discovers from skills/ in the npm package. Just verify config.
      const configPath = resolve(cwd, ".kiro", "settings", "mcp.json");
      if (!existsSync(configPath)) {
        mkdirSync(dirname(configPath), { recursive: true });
        writeFileSync(configPath, JSON.stringify({
          mcpServers: { tracepulse: { command: "tracepulse" } }
        }, null, 2));
        actions.push(`Wrote ${configPath}`);
      } else {
        actions.push(`Config already exists: ${configPath}`);
      }
      break;
    }

    case "cursor": {
      const configPath = resolve(cwd, ".cursor", "mcp.json");
      if (!existsSync(configPath)) {
        mkdirSync(dirname(configPath), { recursive: true });
        writeFileSync(configPath, JSON.stringify({
          mcpServers: { tracepulse: { command: "tracepulse" } }
        }, null, 2));
        actions.push(`Wrote ${configPath}`);
      } else {
        actions.push(`Config already exists: ${configPath}`);
      }
      break;
    }

    default: {
      const configPath = resolve(cwd, ".mcp.json");
      if (!existsSync(configPath)) {
        writeFileSync(configPath, JSON.stringify({
          mcpServers: { tracepulse: { command: "tracepulse" } }
        }, null, 2));
        actions.push(`Wrote ${configPath}`);
      }
      break;
    }
  }

  return actions;
}
