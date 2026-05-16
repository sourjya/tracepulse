/**
 * MCP resource registration for skill discovery.
 *
 * Exposes TracePulse skills as MCP resources that any client can read
 * programmatically. Agents call resources/list to discover available
 * skills, then resources/read to load them into context.
 *
 * URIs: tracepulse://skills/{name}
 *
 * @see .kiro/specs/m23-init-command/requirements.md (M24 section)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** A skill resource with its content. */
export interface SkillResource {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly content: string;
}

// ──────────────────────────────────────────────
// Skill Discovery
// ──────────────────────────────────────────────

/**
 * Get the path to TracePulse's installed skills directory.
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
 * Discover and load all skill resources from the skills/ directory.
 *
 * @returns Array of skill resources with URI, name, and content.
 */
export function getSkillResources(): SkillResource[] {
  const skillsDir = getSkillsDir();
  const resources: SkillResource[] = [];

  if (!existsSync(skillsDir)) return resources;

  // Load top-level .md files (CLAUDE.md, etc.)
  const topFiles = readdirSync(skillsDir).filter(f => f.endsWith(".md"));
  for (const file of topFiles) {
    const name = basename(file, ".md").toLowerCase();
    const content = readFileSync(resolve(skillsDir, file), "utf-8");
    resources.push({
      uri: `tracepulse://skills/${name}`,
      name,
      description: `TracePulse ${name} skill`,
      content,
    });
  }

  // Load subdirectory skills (tracepulse/SKILL.md, claude-rules/tracepulse.md, etc.)
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const dir of dirs) {
    const dirPath = resolve(skillsDir, dir.name);
    const skillFile = existsSync(resolve(dirPath, "SKILL.md"))
      ? resolve(dirPath, "SKILL.md")
      : existsSync(resolve(dirPath, "tracepulse.md"))
        ? resolve(dirPath, "tracepulse.md")
        : null;

    if (skillFile) {
      const content = readFileSync(skillFile, "utf-8");
      resources.push({
        uri: `tracepulse://skills/${dir.name}`,
        name: dir.name,
        description: `TracePulse ${dir.name} workflow`,
        content,
      });
    }
  }

  return resources;
}

/**
 * Register all skill resources on the MCP server.
 *
 * Each skill becomes a readable resource at tracepulse://skills/{name}.
 * Clients call resources/list to discover, resources/read to load.
 *
 * @param server - MCP server instance.
 */
export function registerSkillResources(server: McpServer): void {
  const skills = getSkillResources();

  for (const skill of skills) {
    server.registerResource(
      skill.name,
      skill.uri,
      { description: skill.description, mimeType: "text/markdown" },
      () => ({
        contents: [{
          uri: skill.uri,
          text: skill.content,
          mimeType: "text/markdown",
        }],
      }),
    );
  }
}
