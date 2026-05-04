/**
 * TracePulse - Runtime feedback MCP server for AI coding agents.
 *
 * This is the main entry point for the MCP server. It initializes the server,
 * registers MCP tools, and connects the event pipeline:
 * Process Collectors → Secret Redactor → Error Parsers → Signal Scorer → Event Buffer → MCP Tools.
 *
 * ViewGraph sees the UI. TracePulse feels the backend.
 *
 * @see docs/ideas/feature-architecture-analysis.md for architecture decisions
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read version from package.json at runtime.
 * Single source of truth - no manual VERSION constant to keep in sync.
 */
function readVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // In dist/, package.json is one level up. In src/, it's two levels up.
    for (const rel of ["../package.json", "../../package.json"]) {
      const pkgPath = resolve(__dirname, rel);
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.version) return pkg.version;
      } catch { /* try next */ }
    }
  } catch { /* fallback */ }
  return "0.0.0";
}

export const VERSION = readVersion();
