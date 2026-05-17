/**
 * Process spawner collector - spawns a dev server as a child process and
 * captures stdout/stderr line by line.
 *
 * This is the primary collector for TracePulse's "start" mode. It spawns the
 * user's dev server command via a shell, pipes stdout and stderr through
 * readline interfaces, and forwards each line to the pipeline via the onLine
 * callback. Graceful shutdown sends SIGTERM to the process group first,
 * escalating to SIGKILL after GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS.
 *
 * Uses detached: true so the shell and its children form a process group,
 * allowing stop() to kill the entire tree with a single signal.
 *
 * @see src/types/collectors.ts for the Collector interface
 * @see src/constants/limits.ts for GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { EventSource } from "@/constants/events.js";
import { GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS } from "@/constants/limits.js";
import type { Collector } from "@/types/collectors.js";

/**
 * Build PATH with node_modules/.bin and .venv/bin prepended.
 * Ensures locally-installed binaries are found by start_server,
 * matching the behavior of run_and_watch.
 */
function buildSpawnerPath(cwd?: string): string {
  const base = process.env.PATH ?? "";
  const dir = cwd ?? process.cwd();
  const parts: string[] = [];

  const nodeModulesBin = resolve(dir, "node_modules", ".bin");
  if (existsSync(nodeModulesBin)) parts.push(nodeModulesBin);

  const venvBin = resolve(dir, ".venv", "bin");
  if (existsSync(venvBin)) parts.push(venvBin);

  return parts.length > 0 ? `${parts.join(":")}:${base}` : base;
}

/**
 * Creates a process spawner collector for the given shell command.
 *
 * The returned Collector spawns the command in a detached shell with stdin
 * ignored and stdout/stderr piped. Lines are delivered to the onLine callback
 * tagged with 'server-stdout' or 'server-stderr'. On child exit, a synthetic
 * exit event is emitted on stderr.
 *
 * @param command - Shell command to spawn (e.g., "npm run dev")
 * @param options - Optional cwd and env overrides.
 * @returns Collector that manages the child process lifecycle
 */
export function createProcessSpawner(command: string, options?: { cwd?: string; env?: Record<string, string> }): Collector {
  /** Reference to the spawned child process. Null before start() or after exit. */
  let child: ChildProcess | null = null;

  /** Whether the child process is currently running. */
  let connected = false;

  /** Stored onLine callback for emitting the synthetic exit event. */
  let onLineCallback:
    | ((source: EventSource, line: string) => void)
    | null = null;

  /**
   * Promise that resolves when the child process exits.
   * Used by stop() to wait for the child to fully terminate.
   */
  let exitPromise: Promise<void> | null = null;

  return {
    /**
     * Spawn the child process and begin capturing output.
     *
     * Resolves once the process has spawned and is confirmed alive (survives
     * past the initial 100ms window where command-not-found would exit with
     * code 127). Rejects if the process fails to start or exits immediately
     * with code 127.
     *
     * @param onLine - Callback invoked for each captured line with its source tag
     */
    start(onLine) {
      return new Promise<void>((resolve, reject) => {
        onLineCallback = onLine;
        let settled = false;

        child = spawn(command, {
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
          /**
           * Detached mode creates a new process group so stop() can kill
           * the shell AND its child processes with process.kill(-pid).
           */
          detached: true,
          /**
           * Inherit the user's environment with additions that prevent
           * output buffering in common runtimes. Without these, Python
           * and Ruby dev servers block-buffer stdout when piped, causing
           * delayed error delivery to the agent.
           *
           * Also prepends node_modules/.bin and .venv/bin to PATH so
           * locally-installed binaries are found (same as run_and_watch).
           */
          env: {
            ...process.env,
            ...options?.env,
            PYTHONUNBUFFERED: "1",       // Python: disable stdout buffering
            PYTHONDONTWRITEBYTECODE: "1", // Python: skip .pyc files
            PATH: buildSpawnerPath(options?.cwd),
          },
          ...(options?.cwd ? { cwd: options.cwd } : {}),
        });

        // Prevent the detached child from keeping the parent alive if
        // stop() is never called and the collector is abandoned.
        child.unref();

        /**
         * Handle spawn errors (permission denied, shell not found).
         * With shell: true, most command-not-found errors come via 'close'
         * with exit code 127 instead, but this catches OS-level failures.
         */
        child.on("error", (err) => {
          connected = false;
          child = null;
          if (!settled) {
            settled = true;
            reject(
              new Error(
                `Failed to spawn command "${command}": ${err.message}`,
              ),
            );
          }
        });

        /**
         * Track child exit. Creates a promise that stop() can await.
         * Emits a synthetic exit event so the pipeline knows the process ended.
         * If the process exits with code 127 before we've resolved start(),
         * that indicates command-not-found - reject the start() promise.
         */
        exitPromise = new Promise<void>((exitResolve) => {
          child!.on("close", (code) => {
            connected = false;
            child = null;

            if (onLineCallback) {
              onLineCallback(
                "server-stderr",
                `[tracepulse] Process exited with code ${code}`,
              );
            }

            // Any non-zero exit before start() resolves = fast failure
            if (!settled && code !== null && code !== 0) {
              settled = true;
              reject(
                new Error(
                  `Command failed: "${command}" (exit code ${code})`,
                ),
              );
            }

            exitResolve();
          });
        });

        /** Mark connected once the process is alive and set up line readers. */
        child.on("spawn", () => {
          connected = true;

          if (child!.stdout) {
            const rl = createInterface({ input: child!.stdout });
            rl.on("line", (line) => onLine("server-stdout", line));
          }

          if (child!.stderr) {
            const rl = createInterface({ input: child!.stderr });
            rl.on("line", (line) => onLine("server-stderr", line));
          }

          /**
           * Wait 800ms before resolving to give fast-failing commands
           * (non-zero exit) time to reject first. Shell processes with
           * invalid commands typically exit within ~100-500ms. Under heavy
           * parallel load (e.g., 76 test files), this can take longer.
           */
          setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve();
            }
          }, 800);
        });
      });
    },

    /**
     * Gracefully stop the child process.
     *
     * Sends SIGTERM to the entire process group first. If the process doesn't
     * exit within GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS, escalates to SIGKILL on
     * the process group. Resolves once the child has fully exited.
     */
    async stop() {
      if (!child) {
        if (exitPromise) {
          await exitPromise;
        }
        return;
      }

      const pid = child.pid;

      /** Force-kill timer - escalates to SIGKILL if SIGTERM is ignored. */
      const killTimer = setTimeout(() => {
        if (pid) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            // Process already gone - ignore
          }
        }
      }, GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS * 1000);

      /**
       * Kill the process group (negative PID) so the shell and all its
       * children receive the signal. Falls back to child.kill() if the
       * group kill fails (e.g., process already exited).
       */
      if (pid) {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }

      if (exitPromise) {
        await exitPromise;
      }

      clearTimeout(killTimer);
    },

    /**
     * Whether the child process is currently running.
     *
     * @returns true if the process has spawned and not yet exited
     */
    isConnected() {
      return connected;
    },
  };
}
