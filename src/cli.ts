/**
 * CLI entry point for TracePulse.
 *
 * Parses process.argv and orchestrates startup of the event pipeline and
 * MCP server. Supports two modes: "start" (spawn a dev server) and "attach"
 * (tail an existing log file). All diagnostic output goes to stderr because
 * stdout is reserved for MCP JSON-RPC protocol messages.
 *
 * Usage:
 *   npx tracepulse start "npm run dev"      - spawn and monitor
 *   npx tracepulse attach --log-file ./log   - tail existing log
 *   npx tracepulse --version                 - print version to stderr
 *   npx tracepulse --help                    - print usage to stderr
 *
 * @see src/index.ts for VERSION
 * @see src/mcp/server.ts for MCP tool registration
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "@/index.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createDefaultRegistry } from "@/pipeline/parser-registry.js";
import type { ParserRegistry } from "@/pipeline/parser-registry.js";
import { redact } from "@/pipeline/secret-redactor.js";
import { normalizeEvent, normalizeRawLine } from "@/pipeline/event-normalizer.js";
import { createProcessSpawner } from "@/collectors/process-spawner.js";
import { createLogFileTailer } from "@/collectors/log-file-tailer.js";
import { createMcpServer } from "@/mcp/server.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { Collector } from "@/types/collectors.js";
import type { EventSource } from "@/constants/events.js";
import { createServiceRegistry } from "@/services/service-registry.js";
import { createFrontendErrorBuffer } from "@/correlation/frontend-error-buffer.js";
import { createFingerprintHistory } from "@/persistence/fingerprint-history.js";
import { loadFingerprints, saveFingerprints } from "@/persistence/fingerprint-store.js";
import { createMultiProcessCollector } from "@/collectors/multi-process-collector.js";
import { FINGERPRINT_PERSISTENCE_PATH } from "@/constants/services.js";
import { createHealthProber, type HealthProber } from "@/infra/health-prober.js";

// ──────────────────────────────────────────────
// CLI Argument Types
// ──────────────────────────────────────────────

/** Parsed CLI arguments for the "start" command. */
interface StartArgs {
  readonly command: "start";
  readonly target?: string;
  readonly services?: Array<{ name: string; command: string }>;
  readonly configPath?: string;
  readonly http?: boolean;
  readonly httpPort?: number;
  readonly persist?: boolean;
  readonly healthUrl?: string;
}

/** Parsed CLI arguments for the "attach" command. */
interface AttachArgs {
  readonly command: "attach";
  readonly logFiles: Array<{ name: string; path: string }>;
}

/** Parsed CLI arguments for the "compose" command. */
interface ComposeArgs {
  readonly command: "compose";
  readonly composeFile?: string;
  readonly http?: boolean;
  readonly httpPort?: number;
  readonly persist?: boolean;
}

/** Parsed CLI arguments for flag-only invocations. */
interface FlagArgs {
  readonly command: "version" | "help";
}

/** Union of all valid parsed argument shapes. */
export type ParsedArgs = StartArgs | AttachArgs | ComposeArgs | FlagArgs;

// ──────────────────────────────────────────────
// Usage Text
// ──────────────────────────────────────────────

/** Help text printed to stderr on --help or invalid usage. */
const USAGE = `TracePulse v${VERSION} - Runtime feedback MCP server for AI coding agents.

Usage:
  tracepulse start <command>          Spawn a dev server and monitor its output
  tracepulse attach --log-file <path> Tail an existing log file
  tracepulse --version                Print version
  tracepulse --help                   Print this help

Examples:
  tracepulse start "npm run dev"
  tracepulse attach --log-file /var/log/app.log
`;

// ──────────────────────────────────────────────
// Argument Parsing
// ──────────────────────────────────────────────

import { parseServiceFlag } from "@/config/config-loader.js";

/**
 * Parse raw argv into a typed ParsedArgs structure.
 *
 * Expects argv in the same shape as process.argv (first two entries are
 * node binary and script path, skipped). Returns null if arguments are
 * invalid - caller should print usage and exit.
 *
 * @param argv - Raw process.argv array
 * @returns Parsed arguments, or null if invalid
 */
export function parseArgs(argv: readonly string[]): ParsedArgs | null {
  // Skip node binary and script path
  const args = argv.slice(2);

  if (args.length === 0) return null;

  // Flag-only commands
  if (args.includes("--version") || args.includes("-v")) {
    return { command: "version" };
  }
  if (args.includes("--help") || args.includes("-h")) {
    return { command: "help" };
  }

  const subcommand = args[0];

  if (subcommand === "start") {
    const services: Array<{ name: string; command: string }> = [];
    let target: string | undefined;
    let configPath: string | undefined;
    let http = false;
    let httpPort: number | undefined;
    let persist = false;
    let healthUrl: string | undefined;

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--service" && args[i + 1]) {
        const parsed = parseServiceFlag(args[i + 1]);
        if (parsed) services.push(parsed);
        i++;
      } else if (arg === "--config" && args[i + 1]) {
        configPath = args[i + 1];
        i++;
      } else if (arg === "--http") {
        http = true;
      } else if (arg === "--http-port" && args[i + 1]) {
        httpPort = parseInt(args[i + 1], 10);
        i++;
      } else if (arg === "--persist") {
        persist = true;
      } else if (arg === "--health-url" && args[i + 1]) {
        healthUrl = args[i + 1];
        i++;
      } else if (!arg.startsWith("--") && !target) {
        target = arg;
      }
    }

    // Must have either a target command or --service flags
    if (!target && services.length === 0 && !configPath) return null;

    return {
      command: "start",
      target,
      services: services.length > 0 ? services : undefined,
      configPath,
      http: http || undefined,
      httpPort,
      persist: persist || undefined,
      healthUrl,
    };
  }

  if (subcommand === "attach") {
    const logFiles: Array<{ name: string; path: string }> = [];
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--log-file" && args[i + 1]) {
        const val = args[i + 1];
        const eqIdx = val.indexOf("=");
        if (eqIdx > 0) {
          logFiles.push({ name: val.slice(0, eqIdx), path: val.slice(eqIdx + 1) });
        } else {
          // Derive name from filename
          const base = val.split("/").pop()?.replace(/\.\w+$/, "") ?? "main";
          logFiles.push({ name: base, path: val });
        }
        i++;
      }
    }
    if (logFiles.length === 0) return null;
    return { command: "attach", logFiles };
  }

  if (subcommand === "compose") {
    let composeFile: string | undefined;
    let http = false;
    let httpPort: number | undefined;
    let persist = false;

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--file" && args[i + 1]) {
        composeFile = args[i + 1];
        i++;
      } else if (arg === "--http") {
        http = true;
      } else if (arg === "--http-port" && args[i + 1]) {
        httpPort = parseInt(args[i + 1], 10);
        i++;
      } else if (arg === "--persist") {
        persist = true;
      }
    }

    return {
      command: "compose",
      composeFile,
      http: http || undefined,
      httpPort,
      persist: persist || undefined,
    };
  }

  return null;
}

import { ANSI_ESCAPE_REGEX, MAX_PARSE_INPUT_LENGTH } from "@/constants/limits.js";
import { detectHotReload } from "@/watch/hot-reload-detector.js";
import { createLineAccumulator } from "@/pipeline/line-accumulator.js";
import { createCrashLoopDetector } from "@/pipeline/crash-loop-detector.js";
import { validateEnvironment } from "@/infra/env-validator.js";

// ──────────────────────────────────────────────
// Pipeline Factory
// ──────────────────────────────────────────────

/**
 * Create the line-processing pipeline callback.
 *
 * Wires together: ANSI strip → secret redaction → length guard → parser registry → event normalization → buffer push.
 * Each raw line from a collector flows through this pipeline before entering the ring buffer.
 * Exported for integration testing.
 *
 * @param buffer   - Event buffer to push normalized events into
 * @param registry - Parser registry to attempt error parsing
 * @returns Callback suitable for Collector.start(onLine)
 */
export function createPipeline(
  buffer: EventBuffer,
  registry: ParserRegistry,
): (source: EventSource, rawLine: string, service?: string) => void {
  /** Process a single line (or joined multi-line block) through the pipeline. */
  const crashLoopDetect = createCrashLoopDetector((alert) => buffer.push(alert));

  function processLine(source: EventSource, rawLine: string, service?: string): void {
    const stripped = rawLine.replace(ANSI_ESCAPE_REGEX, "");
    const redacted = redact(stripped);

    const hotReloadEvent = detectHotReload(redacted);
    if (hotReloadEvent) {
      buffer.push(service ? { ...hotReloadEvent, service } : hotReloadEvent);
    }

    const parseInput = redacted.length > MAX_PARSE_INPUT_LENGTH
      ? redacted.slice(0, MAX_PARSE_INPUT_LENGTH)
      : redacted;
    const parsed = registry.parse(parseInput);
    const event = parsed
      ? normalizeEvent(parsed, redacted, source, true)
      : normalizeRawLine(redacted, source);
    const tagged = service ? { ...event, service } : event;
    buffer.push(tagged);
    crashLoopDetect(tagged);
  }

  // Accumulator joins multi-line blocks (Python tracebacks, Java exceptions)
  // before feeding them to the parser pipeline.
  let currentSource: EventSource = "server-stdout";
  let currentService: string | undefined;
  const accumulator = createLineAccumulator((joined) => {
    processLine(currentSource, joined, currentService);
  });

  return (source: EventSource, rawLine: string, service?: string): void => {
    currentSource = source;
    currentService = service;
    accumulator(rawLine);
  };
}

// ──────────────────────────────────────────────
// Main Entry Point
// ──────────────────────────────────────────────

/**
 * Main CLI function. Parses arguments, starts the collector and MCP server,
 * and sets up graceful shutdown handlers.
 *
 * Exits with code 0 on success, 1 on invalid arguments or startup failure.
 * All output goes to stderr - stdout is reserved for MCP JSON-RPC.
 */
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (!parsed) {
    process.stderr.write(`Error: Invalid arguments.\n\n${USAGE}`);
    process.exit(1);
  }

  if (parsed.command === "version") {
    process.stderr.write(`TracePulse v${VERSION}\n`);
    return process.exit(0);
  }

  if (parsed.command === "help") {
    process.stderr.write(USAGE);
    return process.exit(0);
  }

  // ── Global error handlers ──
  // Prevent unhandled errors from silently crashing the MCP server.
  // Log to stderr and attempt graceful shutdown.
  process.on("uncaughtException", (err) => {
    process.stderr.write(`[tracepulse] Uncaught exception: ${err.message}\n`);
    process.exitCode = 1;
  });
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    process.stderr.write(`[tracepulse] Unhandled rejection: ${msg}\n`);
  });

  // ── EPIPE detection ──
  // When the MCP client (IDE/agent) crashes, the stdio pipe breaks.
  // Detect this and initiate graceful shutdown instead of crashing.
  process.stdout.on("error", (err) => {
    if ((err as NodeJS.ErrnoException).code === "EPIPE") {
      process.stderr.write("[tracepulse] stdout pipe broken (client disconnected)\n");
      void shutdown();
    }
  });

  // Create shared pipeline components
  const buffer = createRingBuffer();
  const registry = createDefaultRegistry();
  const serviceRegistry = createServiceRegistry();
  const frontendBuffer = createFrontendErrorBuffer();
  const fingerprintHistory = createFingerprintHistory();
  const processLine = createPipeline(buffer, registry);
  const persistEnabled = parsed.command === "start" && parsed.persist;

  // Load fingerprint history if persistence is enabled
  if (persistEnabled) {
    const entries = loadFingerprints(FINGERPRINT_PERSISTENCE_PATH);
    fingerprintHistory.loadEntries(entries);
    process.stderr.write(`[tracepulse] Loaded ${entries.length} fingerprints from disk\n`);
  }

  // Validate environment variables against .env.example
  const envWarnings = validateEnvironment();
  for (const warning of envWarnings) {
    buffer.push(warning);
  }
  if (envWarnings.length > 0) {
    process.stderr.write(`[tracepulse] ${envWarnings.length} missing environment variable(s)\n`);
  }

  // Create the appropriate collector based on command.
  let collector: Collector | { start: (cb: (s: EventSource, l: string) => void) => Promise<void>; stop: () => Promise<void>; isConnected: () => boolean };
  if (parsed.command === "start") {
    if (parsed.services && parsed.services.length > 0) {
      // Multi-process mode
      const multiCollector = createMultiProcessCollector(parsed.services, serviceRegistry);
      collector = {
        start: (onLine: (source: EventSource, line: string) => void) =>
          multiCollector.start((source, line, _service) => onLine(source, line)),
        stop: () => multiCollector.stop(),
        isConnected: () => multiCollector.isConnected(),
      };
    } else if (parsed.target) {
      // Single-process mode
      serviceRegistry.register("main", "process");
      collector = createProcessSpawner(parsed.target);
    } else {
      process.stderr.write("[tracepulse] start requires a command or --service flags\n");
      return process.exit(1);
    }
  } else if (parsed.command === "attach") {
    for (const lf of parsed.logFiles) {
      serviceRegistry.register(lf.name, "process");
    }
    if (parsed.logFiles.length === 1) {
      collector = createLogFileTailer(parsed.logFiles[0].path);
    } else {
      // Multi-file: create a composite collector
      const tailers = parsed.logFiles.map((lf) => ({
        name: lf.name,
        tailer: createLogFileTailer(lf.path),
      }));
      collector = {
        async start(onLine: (source: EventSource, line: string) => void) {
          await Promise.all(tailers.map((t) => t.tailer.start(onLine)));
        },
        async stop() {
          await Promise.all(tailers.map((t) => t.tailer.stop()));
        },
        isConnected() {
          return tailers.some((t) => t.tailer.isConnected());
        },
      };
    }
  } else {
    process.stderr.write(`[tracepulse] Unknown command: ${(parsed as ParsedArgs).command}\n`);
    return process.exit(1);
  }

  // Start collector - rejects on command-not-found or file-not-found
  try {
    await collector.start(processLine);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[tracepulse] Failed to start: ${msg}\n`);
    process.exit(1);
  }

  process.stderr.write(`[tracepulse] Collector started (${parsed.command} mode)\n`);

  // Start health prober if --health-url is configured
  let healthProber: HealthProber | null = null;
  if (parsed.command === "start" && parsed.healthUrl) {
    healthProber = createHealthProber(parsed.healthUrl);
    healthProber.start();
    process.stderr.write(`[tracepulse] Health prober started: ${parsed.healthUrl}\n`);
  }

  // Create and connect MCP server over stdio
  const server = createMcpServer(buffer, () => collector.isConnected(), {
    registry: serviceRegistry,
    frontendBuffer,
    fingerprintHistory,
    cwd: process.cwd(),
    isAttachMode: parsed.command === "attach",
  });
  const transport = new StdioServerTransport();

  // Graceful shutdown: stop collector, close MCP server.
  // Guard flag prevents double-shutdown from rapid Ctrl+C.
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write("[tracepulse] Shutting down...\n");
    if (healthProber) healthProber.stop();
    if (persistEnabled) {
      saveFingerprints(FINGERPRINT_PERSISTENCE_PATH, fingerprintHistory.exportEntries());
      process.stderr.write("[tracepulse] Fingerprints saved to disk\n");
    }
    await collector.stop();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await server.connect(transport);
  process.stderr.write("[tracepulse] MCP server connected via stdio\n");
}

// Only auto-execute when run as the CLI entry point, not when imported by tests.
// In ESM, import.meta.url matches the file URL; process.argv[1] is the script path.
// When vitest imports this module, process.argv[1] points to vitest, not cli.ts.
const isDirectExecution =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isDirectExecution) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[tracepulse] Fatal: ${msg}\n`);
    process.exit(1);
  });
}
