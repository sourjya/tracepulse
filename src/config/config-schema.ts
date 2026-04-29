/**
 * Configuration schema and validation for TracePulse.
 *
 * Defines the TracePulseConfig interface and validateConfig function
 * that validates untrusted config input (from JSON file or CLI args).
 *
 * @see .kiro/specs/phase3-multi-process/design.md for config schema
 */

// ──────────────────────────────────────────────
// Config Interfaces
// ──────────────────────────────────────────────

/** A single service to monitor via child process. */
export interface ServiceConfig {
  /** Unique service name - only [a-z0-9-] allowed. */
  readonly name: string;
  /** Shell command to spawn the service. */
  readonly command: string;
}

/** Docker Compose integration settings. */
export interface ComposeConfig {
  /** Path to docker-compose.yml (default: "docker-compose.yml"). */
  readonly file?: string;
}

/** Transport configuration. */
export interface TransportConfig {
  /** Enable Streamable HTTP transport alongside stdio. */
  readonly http?: boolean;
  /** HTTP transport port (default: 9800, range: 1024-65535). */
  readonly http_port?: number;
}

/** Full TracePulse configuration. */
export interface TracePulseConfig {
  readonly services?: ServiceConfig[];
  readonly compose?: ComposeConfig;
  readonly transport?: TransportConfig;
  readonly persist?: boolean;
  readonly correlation_window_ms?: number;
}

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

/** Result of config validation. */
export interface ConfigValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly config?: TracePulseConfig;
}

/** Allowed characters for service names. */
const SERVICE_NAME_PATTERN = /^[a-z0-9-]+$/;

/** Known top-level config keys. */
const KNOWN_KEYS = new Set(["services", "compose", "transport", "persist", "correlation_window_ms"]);

/**
 * Validate a raw config object against the TracePulse schema.
 *
 * @param raw - Untrusted config input (parsed JSON or constructed from CLI).
 * @returns Validation result with parsed config or error message.
 */
export function validateConfig(raw: Record<string, unknown>): ConfigValidationResult {
  // Check for unknown keys before casting
  const unknownKeys = Object.keys(raw).filter((k) => !KNOWN_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return { valid: false, error: `Unknown config key(s): ${unknownKeys.join(", ")}` };
  }

  const config = raw as TracePulseConfig;

  // Mutual exclusivity: services and compose cannot coexist
  if (config.services && config.compose) {
    return { valid: false, error: "services and compose are mutually exclusive" };
  }

  // Validate services array
  if (config.services) {
    const names = new Set<string>();
    for (const svc of config.services) {
      if (!svc.name || typeof svc.name !== "string") {
        return { valid: false, error: "service name must be a non-empty string" };
      }
      if (!SERVICE_NAME_PATTERN.test(svc.name)) {
        return { valid: false, error: `service name "${svc.name}" must match [a-z0-9-]` };
      }
      if (!svc.command || typeof svc.command !== "string") {
        return { valid: false, error: `service "${svc.name}" command must be a non-empty string` };
      }
      if (names.has(svc.name)) {
        return { valid: false, error: `duplicate service name: "${svc.name}"` };
      }
      names.add(svc.name);
    }
  }

  // Validate correlation_window_ms
  if (config.correlation_window_ms !== undefined) {
    if (config.correlation_window_ms < 100 || config.correlation_window_ms > 10000) {
      return { valid: false, error: "correlation_window_ms must be between 100 and 10000" };
    }
  }

  // Validate transport
  if (config.transport?.http_port !== undefined) {
    if (config.transport.http_port < 1024 || config.transport.http_port > 65535) {
      return { valid: false, error: "transport.http_port must be between 1024 and 65535" };
    }
  }

  return { valid: true, config };
}
