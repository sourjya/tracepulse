/**
 * Service registry for tracking monitored services.
 *
 * Central coordinator for all monitored services in multi-process mode.
 * Tracks lifecycle state, error counts, and last activity per service.
 * In single-process mode, a single "main" entry is registered.
 *
 * @see src/constants/services.ts for ServiceStatus type
 * @see .kiro/specs/phase3-multi-process/design.md for registry design
 */

import type { ServiceStatus } from "@/constants/services.js";

/**
 * Metadata for a single monitored service.
 */
export interface ServiceEntry {
  /** Service name from config, CLI, or Docker Compose. */
  readonly name: string;
  /** Current lifecycle state. */
  readonly status: ServiceStatus;
  /** Total errors since TracePulse started. */
  readonly errorCount: number;
  /** Unix ms of the most recent event from this service. */
  readonly lastActivity: number;
  /** Source type - process spawn or Docker container. */
  readonly sourceType: "process" | "docker";
}

/**
 * Public API for the service registry.
 */
export interface ServiceRegistry {
  /** Register a new service. Throws if name already exists. */
  register(name: string, sourceType: "process" | "docker"): void;
  /** Update a service's lifecycle status. Throws if name not found. */
  updateStatus(name: string, status: ServiceStatus): void;
  /** Record an event from a service - increments errorCount, updates lastActivity. */
  recordEvent(name: string, timestamp: number): void;
  /** Get all registered services. */
  getServices(): readonly ServiceEntry[];
  /** Get a single service by name, or undefined if not found. */
  getService(name: string): ServiceEntry | undefined;
}

/**
 * Create a new service registry.
 *
 * @returns A ServiceRegistry instance with no services registered.
 */
export function createServiceRegistry(): ServiceRegistry {
  const services = new Map<string, ServiceEntry>();

  return {
    register(name: string, sourceType: "process" | "docker"): void {
      if (services.has(name)) {
        throw new Error(`Service already registered: ${name}`);
      }
      services.set(name, {
        name,
        status: "running",
        errorCount: 0,
        lastActivity: 0,
        sourceType,
      });
    },

    updateStatus(name: string, status: ServiceStatus): void {
      const entry = services.get(name);
      if (!entry) {
        throw new Error(`Unknown service: ${name}`);
      }
      services.set(name, { ...entry, status });
    },

    recordEvent(name: string, timestamp: number): void {
      const entry = services.get(name);
      if (!entry) return;
      services.set(name, {
        ...entry,
        errorCount: entry.errorCount + 1,
        lastActivity: timestamp,
      });
    },

    getServices(): readonly ServiceEntry[] {
      return [...services.values()];
    },

    getService(name: string): ServiceEntry | undefined {
      return services.get(name);
    },
  };
}
