/**
 * Tool clustering gateway for progressive disclosure.
 *
 * Collapses 33 tools into 7 gateway tools + 2 standalone (run_and_watch,
 * get_requests). Schema overhead drops from ~6,600 to ~1,800 tokens at
 * session start. Sub-tools load on demand via gateway discovery.
 *
 * Architecture: product-agnostic gateway. Depends only on MCP SDK types,
 * Zod schemas, and cluster-config.json. Portable to ViewGraph or any
 * MCP server.
 *
 * @see docs/engineering/designs/tool-clustering-guide.md
 * @see .kiro/specs/m15-tool-schema-optimization/requirements.md
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** A cluster definition from cluster-config.json. */
export interface ClusterDef {
  readonly gateway: string;
  readonly description: string;
  readonly tools: readonly string[];
}

/** Full cluster configuration. */
export interface ClusterConfig {
  readonly clusters: readonly ClusterDef[];
  readonly standalone?: readonly string[];
}

/** A registered tool entry in the registry. */
interface ToolEntry {
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly handler: (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>;
}

/** Tool registry that captures registrations for clustered mode. */
export interface ToolRegistry {
  /** Register a tool into the registry. */
  register(name: string, meta: { description: string; inputSchema: Record<string, unknown> }, handler: ToolEntry["handler"]): void;
  /** Get a tool entry by name. */
  get(name: string): ToolEntry | undefined;
  /** List all registered tool names. */
  list(): string[];
  /** Number of registered tools. */
  readonly size: number;
}

// ──────────────────────────────────────────────
// Config Loading
// ──────────────────────────────────────────────

/**
 * Load cluster configuration from cluster-config.json.
 *
 * @returns Parsed cluster config.
 */
export function loadClusterConfig(): ClusterConfig {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configPath = resolve(__dirname, "cluster-config.json");
  return JSON.parse(readFileSync(configPath, "utf-8")) as ClusterConfig;
}

// ──────────────────────────────────────────────
// Tool Registry
// ──────────────────────────────────────────────

/**
 * Create a tool registry that captures tool registrations.
 * In clustered mode, tools register here instead of on the MCP server.
 *
 * @returns Empty ToolRegistry.
 */
export function createToolRegistry(): ToolRegistry {
  const entries = new Map<string, ToolEntry>();

  return {
    register(name, meta, handler) {
      entries.set(name, { description: meta.description, inputSchema: meta.inputSchema, handler });
    },
    get(name) {
      return entries.get(name);
    },
    list() {
      return [...entries.keys()];
    },
    get size() {
      return entries.size;
    },
  };
}

// ──────────────────────────────────────────────
// Gateway Handler
// ──────────────────────────────────────────────

/** Destructive tools that require confirm=true. */
const DESTRUCTIVE_TOOLS = new Set(["clear_errors", "restart_server"]);

/**
 * Create a gateway handler for a cluster.
 *
 * When called without `action`, returns the list of available sub-tools (discovery).
 * When called with `action`, dispatches to the sub-tool handler.
 *
 * @param cluster - Cluster definition.
 * @param registry - Tool registry with registered handlers.
 * @returns Gateway handler function.
 */
export function createGatewayHandler(
  cluster: ClusterDef,
  registry: ToolRegistry,
): (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult> {
  return (args) => {
    const action = args.action as string | undefined;

    // Discovery mode: no action = list available sub-tools
    if (!action) {
      const tools = cluster.tools
        .map((name) => {
          const entry = registry.get(name);
          return entry ? { name, description: entry.description } : null;
        })
        .filter(Boolean);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            gateway: cluster.gateway,
            description: cluster.description,
            available_tools: tools,
          }),
        }],
      };
    }

    // Dispatch mode: action = sub-tool name
    if (!cluster.tools.includes(action)) {
      return {
        content: [{
          type: "text",
          text: `Unknown action "${action}" for ${cluster.gateway}. Available: ${cluster.tools.join(", ")}`,
        }],
        isError: true,
      };
    }

    // Destructive action guard
    if (DESTRUCTIVE_TOOLS.has(action) && !args.confirm) {
      return {
        content: [{
          type: "text",
          text: `"${action}" is a destructive operation. Re-call with confirm=true to proceed.`,
        }],
      };
    }

    const entry = registry.get(action);
    if (!entry) {
      return {
        content: [{ type: "text", text: `Tool "${action}" is registered in config but not in the handler registry.` }],
        isError: true,
      };
    }

    // Remove gateway-specific params before passing to sub-tool
    const { action: _, confirm: __, ...subParams } = args;
    return entry.handler(subParams);
  };
}
