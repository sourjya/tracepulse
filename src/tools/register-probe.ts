/**
 * MCP tool handler for register_probe.
 *
 * Allows the AI agent to register health probes for critical endpoints.
 * Probes run on a schedule and surface failures in get_project_health.
 *
 * Key insight: TP config should be agent-generated, not human-written.
 * The agent knows every endpoint it built.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { request as httpRequest } from "node:http";

/** A registered probe definition. */
export interface ProbeDefinition {
  readonly name: string;
  readonly method: string;
  readonly url: string;
  readonly body?: Record<string, unknown>;
  readonly expect_status: number;
  readonly expect_body_contains?: string;
  readonly interval_seconds: number;
}

/** Result of a probe execution. */
export interface ProbeExecResult {
  readonly name: string;
  readonly status: "pass" | "fail" | "error";
  readonly http_status?: number;
  readonly latency_ms: number;
  readonly error?: string;
  readonly checked_at: number;
}

/** Probe manager - stores definitions, executes probes, caches results. */
export interface ProbeManager {
  register(probe: ProbeDefinition): void;
  unregister(name: string): void;
  list(): ProbeDefinition[];
  getResults(): ProbeExecResult[];
  start(): void;
  stop(): void;
}

/**
 * Create a probe manager.
 */
export function createProbeManager(): ProbeManager {
  const probes = new Map<string, ProbeDefinition>();
  const results = new Map<string, ProbeExecResult>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  /** Execute a single probe. */
  function executeProbe(probe: ProbeDefinition): void {
    const start = Date.now();
    const parsed = new URL(probe.url);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: probe.method,
      timeout: 5000,
      headers: probe.body ? { "Content-Type": "application/json" } : undefined,
    };

    const req = httpRequest(options, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => {
        const latency = Date.now() - start;
        const statusOk = res.statusCode === probe.expect_status;
        const bodyOk = !probe.expect_body_contains || body.includes(probe.expect_body_contains);

        results.set(probe.name, {
          name: probe.name,
          status: statusOk && bodyOk ? "pass" : "fail",
          http_status: res.statusCode,
          latency_ms: latency,
          error: !statusOk ? `Expected ${probe.expect_status}, got ${res.statusCode}` :
                 !bodyOk ? `Response missing "${probe.expect_body_contains}"` : undefined,
          checked_at: Date.now(),
        });
      });
    });

    req.on("error", (err) => {
      results.set(probe.name, {
        name: probe.name,
        status: "error",
        latency_ms: Date.now() - start,
        error: err.message,
        checked_at: Date.now(),
      });
    });

    req.on("timeout", () => {
      req.destroy();
      results.set(probe.name, {
        name: probe.name,
        status: "error",
        latency_ms: 5000,
        error: "timeout",
        checked_at: Date.now(),
      });
    });

    if (probe.body) req.write(JSON.stringify(probe.body));
    req.end();
  }

  return {
    register(probe: ProbeDefinition): void {
      probes.set(probe.name, probe);
      // Start periodic execution
      executeProbe(probe);
      const timer = setInterval(() => executeProbe(probe), probe.interval_seconds * 1000);
      if (typeof timer === "object" && "unref" in timer) timer.unref();
      timers.set(probe.name, timer);
    },

    unregister(name: string): void {
      probes.delete(name);
      results.delete(name);
      const timer = timers.get(name);
      if (timer) { clearInterval(timer); timers.delete(name); }
    },

    list(): ProbeDefinition[] {
      return [...probes.values()];
    },

    getResults(): ProbeExecResult[] {
      return [...results.values()];
    },

    start(): void {},

    stop(): void {
      for (const timer of timers.values()) clearInterval(timer);
      timers.clear();
    },
  };
}

/**
 * Handle register_probe MCP tool call.
 */
export function handleRegisterProbe(
  manager: ProbeManager,
  args: Record<string, unknown>,
): CallToolResult {
  const name = args.name as string;
  if (!name) return { content: [{ type: "text", text: "name is required" }], isError: true };
  const url = args.url as string;
  if (!url) return { content: [{ type: "text", text: "url is required" }], isError: true };

  const probe: ProbeDefinition = {
    name,
    method: (args.method as string) ?? "GET",
    url,
    body: args.body as Record<string, unknown> | undefined,
    expect_status: (args.expect_status as number) ?? 200,
    expect_body_contains: args.expect_body_contains as string | undefined,
    interval_seconds: (args.interval_seconds as number) ?? 60,
  };

  if (!probe.url) return { content: [{ type: "text", text: "url is required" }], isError: true };

  // Security: restrict probes to localhost only (prevent SSRF)
  try {
    const parsed = new URL(probe.url);
    const host = parsed.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      return { content: [{ type: "text", text: "Probes are restricted to localhost URLs only (127.0.0.1, localhost, ::1)." }], isError: true };
    }
  } catch {
    return { content: [{ type: "text", text: "Invalid URL format" }], isError: true };
  }

  manager.register(probe);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        registered: true,
        probe: { name: probe.name, method: probe.method, url: probe.url, interval: probe.interval_seconds },
        message: `Probe "${name}" registered. Will check ${probe.method} ${probe.url} every ${probe.interval_seconds}s.`,
      }),
    }],
  };
}

/**
 * Handle list_probes MCP tool call.
 */
export function handleListProbes(manager: ProbeManager): CallToolResult {
  const probes = manager.list();
  const results = manager.getResults();

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        probes: probes.map((p) => ({
          name: p.name,
          method: p.method,
          url: p.url,
          interval_seconds: p.interval_seconds,
          last_result: results.find((r) => r.name === p.name),
        })),
        total: probes.length,
        passing: results.filter((r) => r.status === "pass").length,
        failing: results.filter((r) => r.status !== "pass").length,
      }),
    }],
  };
}
