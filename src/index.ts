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

/**
 * Version injected at build time by tsup from package.json.
 * No runtime file reads, no relative paths, no drift.
 * tsup.config.ts defines process.env.TRACEPULSE_VERSION = package.json version.
 */
export const VERSION: string = process.env.TRACEPULSE_VERSION ?? "0.0.0-dev";
