/**
 * Environment variable validator.
 *
 * Checks .env.example against actual environment variables on startup.
 * Injects warning events for missing vars.
 *
 * @see src/types/events.ts for RuntimeEvent
 */

import { existsSync, readFileSync } from "node:fs";
import type { RuntimeEvent } from "@/types/events.js";

/**
 * Validate environment variables against .env.example.
 *
 * @param envExamplePath - Path to .env.example file.
 * @returns Array of warning events for missing variables.
 */
export function validateEnvironment(envExamplePath: string = ".env.example"): RuntimeEvent[] {
  if (!existsSync(envExamplePath)) return [];

  const content = readFileSync(envExamplePath, "utf-8");
  const warnings: RuntimeEvent[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;

    const varName = trimmed.slice(0, eqIdx).trim();
    if (!process.env[varName]) {
      warnings.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        source: "server-stdout",
        service: "main",
        level: "warn",
        message: `Missing environment variable: ${varName} (defined in .env.example)`,
        fingerprint: `env:missing:${varName}`,
        signal_score: 30,
        signal_strength: "medium",
        context: { error_type: "MissingEnvVar" },
        raw: `${varName} not set in environment`,
        first_seen: Date.now(),
        occurrence_count: 1,
      });
    }
  }

  return warnings;
}
