/**
 * Manifest registration for external dashboard integration.
 *
 * When DASHBOARD_URL env var is set, TracePulse POSTs its manifest
 * on startup and re-registers periodically. The dashboard discovers
 * TracePulse's REST endpoints and health status from the manifest.
 *
 * No dashboard-specific code runs when DASHBOARD_URL is not set.
 *
 * @see .kiro/specs/m22-http-rest-api/requirements.md Phase 3
 */

/** Re-registration interval: 5 minutes. */
const REREGISTER_INTERVAL_MS = 5 * 60 * 1000;

/** Manifest shape matching the dashboard's expected format. */
export interface ToolManifest {
  readonly tool_name: string;
  readonly display_name: string;
  readonly base_url: string;
  readonly version: string;
  readonly manifest: {
    readonly type: string;
    readonly description: string;
    readonly capabilities: readonly string[];
    readonly widgets: readonly Array<{
      readonly id: string;
      readonly title: string;
      readonly type: string;
      readonly data_source: string;
      readonly refresh_interval_s: number;
    }>;
    readonly health_endpoint: string;
    readonly mcp: {
      readonly transport: string;
      readonly tools_count: number;
    };
  };
}

/**
 * Build the TracePulse manifest for dashboard registration.
 *
 * @param opts - Port and version info.
 * @returns Manifest object ready to POST.
 */
export function buildManifest(opts: { port: number; version: string }): ToolManifest {
  return {
    tool_name: "tracepulse",
    display_name: "TracePulse",
    base_url: `http://127.0.0.1:${opts.port}`,
    version: opts.version,
    manifest: {
      type: "dev-tool",
      description: "Runtime feedback MCP server for AI coding agents",
      capabilities: ["error-monitoring", "test-runner", "drift-detection", "bug-patterns"],
      widgets: [
        { id: "tp-error-feed", title: "Live Error Feed", type: "list", data_source: "/api/errors", refresh_interval_s: 10 },
        { id: "tp-session", title: "Session Summary", type: "stats", data_source: "/api/session", refresh_interval_s: 60 },
        { id: "tp-patterns", title: "Bug Patterns", type: "table", data_source: "/api/patterns", refresh_interval_s: 300 },
      ],
      health_endpoint: "/health",
      mcp: { transport: "streamable-http", tools_count: 39 },
    },
  };
}

/**
 * Register TracePulse with an external dashboard.
 *
 * POSTs the manifest to DASHBOARD_URL/api/v1/manifests.
 * Retries once on failure. Logs to stderr.
 *
 * @param dashboardUrl - Base URL of the dashboard (e.g., http://localhost:7200).
 * @param manifest - The manifest to register.
 */
export async function registerManifest(dashboardUrl: string, manifest: ToolManifest): Promise<boolean> {
  const url = `${dashboardUrl}/api/v1/manifests`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      process.stderr.write(`[tracepulse] Registered with dashboard at ${dashboardUrl}\n`);
      return true;
    }
    process.stderr.write(`[tracepulse] Dashboard registration failed: ${res.status} ${res.statusText}\n`);
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[tracepulse] Dashboard registration failed: ${msg}\n`);
    return false;
  }
}

/**
 * Start periodic re-registration with the dashboard.
 *
 * @param dashboardUrl - Base URL of the dashboard.
 * @param manifest - The manifest to register.
 * @returns Cleanup function to stop re-registration.
 */
export function startPeriodicRegistration(dashboardUrl: string, manifest: ToolManifest): () => void {
  const interval = setInterval(() => {
    void registerManifest(dashboardUrl, manifest);
  }, REREGISTER_INTERVAL_MS);

  return () => clearInterval(interval);
}
