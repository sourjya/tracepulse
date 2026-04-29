/**
 * Multi-process collector for spawning and monitoring multiple services.
 *
 * Extends the Phase 1 single-process model to manage N child processes.
 * Each process gets its own stdout/stderr listeners that tag events with
 * the service name. Process exits update the service registry.
 *
 * @see src/services/service-registry.ts for the ServiceRegistry
 * @see .kiro/specs/phase3-multi-process/design.md for design
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type { ServiceConfig } from "@/config/config-schema.js";
import type { ServiceRegistry } from "@/services/service-registry.js";
import type { EventSource } from "@/constants/events.js";
import { GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS } from "@/constants/limits.js";

/** Callback for each line received from a service. */
export type MultiLineCallback = (
  source: EventSource,
  line: string,
  service: string,
) => void;

/** Public API for the multi-process collector. */
export interface MultiProcessCollector {
  start(onLine: MultiLineCallback): Promise<void>;
  stop(): Promise<void>;
  isConnected(): boolean;
}

/**
 * Create a multi-process collector that spawns and monitors multiple services.
 *
 * @param services - Service configurations to spawn.
 * @param registry - Service registry to track lifecycle state.
 * @returns A MultiProcessCollector.
 */
export function createMultiProcessCollector(
  services: readonly ServiceConfig[],
  registry: ServiceRegistry,
): MultiProcessCollector {
  const children = new Map<string, ChildProcess>();
  let running = false;

  return {
    async start(onLine: MultiLineCallback): Promise<void> {
      running = true;

      for (const svc of services) {
        registry.register(svc.name, "process");

        const child = spawn(svc.command, {
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
        });

        children.set(svc.name, child);

        // Pipe stdout
        if (child.stdout) {
          const rl = createInterface({ input: child.stdout });
          rl.on("line", (line) => {
            onLine("server-stdout", line, svc.name);
          });
        }

        // Pipe stderr
        if (child.stderr) {
          const rl = createInterface({ input: child.stderr });
          rl.on("line", (line) => {
            onLine("server-stderr", line, svc.name);
          });
        }

        // Handle exit
        child.on("exit", (code) => {
          if (code === 0 || code === null) {
            registry.updateStatus(svc.name, "stopped");
          } else {
            registry.updateStatus(svc.name, "crashed");
          }
          children.delete(svc.name);
        });

        child.on("error", (err) => {
          process.stderr.write(
            `[tracepulse] service "${svc.name}" spawn error: ${err.message}\n`,
          );
          registry.updateStatus(svc.name, "crashed");
          children.delete(svc.name);
        });
      }
    },

    async stop(): Promise<void> {
      running = false;
      const killPromises: Promise<void>[] = [];

      for (const [name, child] of children) {
        killPromises.push(
          new Promise<void>((resolve) => {
            // If child already exited, resolve immediately (avoids exit-race)
            if (child.exitCode !== null) {
              resolve();
              return;
            }

            const timer = setTimeout(() => {
              try {
                if (child.pid) process.kill(-child.pid, "SIGKILL");
              } catch {
                /* already dead */
              }
              resolve();
            }, GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS * 1000);

            child.on("exit", () => {
              clearTimeout(timer);
              resolve();
            });

            try {
              if (child.pid) process.kill(-child.pid, "SIGTERM");
            } catch {
              clearTimeout(timer);
              resolve();
            }
          }),
        );
      }

      await Promise.all(killPromises);
    },

    isConnected(): boolean {
      return running && children.size > 0;
    },
  };
}
