/**
 * MCP tool handler for list_services.
 *
 * Returns all registered services with their status, error count,
 * and last activity timestamp.
 *
 * @see src/services/service-registry.ts for the ServiceRegistry
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceRegistry } from "@/services/service-registry.js";

/**
 * Handle list_services MCP tool call.
 *
 * @param registry - Service registry to query.
 * @returns MCP CallToolResult with service list.
 */
export function handleListServices(registry: ServiceRegistry): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ services: registry.getServices() }),
      },
    ],
  };
}
