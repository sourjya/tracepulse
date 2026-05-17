/**
 * Configuration loader for TracePulse.
 *
 * Resolves configuration from CLI flags and config file with precedence:
 * CLI flags > config file > defaults. Validates the merged result.
 *
 * @see src/config/config-schema.ts for validation
 * @see .kiro/specs/phase3-multi-process/design.md for config loader design
 */

import { existsSync, readFileSync } from "node:fs";
import {
  validateConfig,
  type ServiceConfig,
  type ConfigValidationResult,
} from "@/config/config-schema.js";

/** Default config file name searched in cwd. */
const DEFAULT_CONFIG_FILE = "tracepulse.config.json";

/** CLI-provided config options (pre-parsed from argv). */
export interface ConfigOptions {
  /** Explicit config file path (--config flag). */
  readonly configPath?: string;
  /** Services from --service flags. */
  readonly services?: ServiceConfig[];
  /** Enable HTTP transport (--http flag). */
  readonly http?: boolean;
  /** HTTP port (--http-port flag). */
  readonly httpPort?: number;
  /** Enable persistence (--persist flag). */
  readonly persist?: boolean;
}

/**
 * Parse a --service flag value like 'api="npm run dev"' into a ServiceConfig.
 *
 * @param value - Raw flag value in name=command format.
 * @returns Parsed ServiceConfig, or null if format is invalid.
 */
export function parseServiceFlag(value: string): ServiceConfig | null {
  const eqIdx = value.indexOf("=");
  if (eqIdx <= 0) return null;

  const name = value.slice(0, eqIdx);
  let command = value.slice(eqIdx + 1);
  if (!command) return null;

  // Strip surrounding quotes
  if (
    (command.startsWith('"') && command.endsWith('"')) ||
    (command.startsWith("'") && command.endsWith("'"))
  ) {
    command = command.slice(1, -1);
  }

  return { name, command };
}

/**
 * Load and validate TracePulse configuration.
 *
 * Reads from config file (if available), merges with CLI options,
 * validates the result, and returns the final config.
 *
 * @param options - CLI-provided config options.
 * @returns Validation result with merged config or error.
 */
export function loadConfig(options: ConfigOptions): ConfigValidationResult {
  let fileConfig: Record<string, unknown> = {};

  // Load config file
  const configPath = options.configPath;
  if (configPath) {
    // Explicit path - must exist
    if (!existsSync(configPath)) {
      return { valid: false, error: `Config file not found: ${configPath}` };
    }
    try {
      fileConfig = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch (err) {
      return { valid: false, error: `Config file contains invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  } else {
    // Default path - optional
    if (existsSync(DEFAULT_CONFIG_FILE)) {
      try {
        fileConfig = JSON.parse(readFileSync(DEFAULT_CONFIG_FILE, "utf-8")) as Record<string, unknown>;
      } catch (err) {
        return { valid: false, error: `Default config file contains invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
  }

  // Conflict detection: CLI services + file services
  if (options.services?.length && fileConfig.services) {
    return {
      valid: false,
      error: "conflict: --service flags and config file services cannot be used together",
    };
  }

  // Merge: CLI overrides file
  const merged: Record<string, unknown> = { ...fileConfig };

  if (options.services?.length) {
    merged.services = options.services;
  }
  if (options.http !== undefined) {
    merged.transport = { ...(merged.transport as Record<string, unknown> ?? {}), http: options.http };
  }
  if (options.httpPort !== undefined) {
    merged.transport = { ...(merged.transport as Record<string, unknown> ?? {}), http_port: options.httpPort };
  }
  if (options.persist !== undefined) {
    merged.persist = options.persist;
  }

  return validateConfig(merged);
}
