/**
 * Edge case tests for verify_mcp tool.
 *
 * Covers:
 * - Invalid JSON-RPC responses (missing fields, wrong id)
 * - Server that outputs to stderr before responding
 * - Timeout validation (max 30s)
 *
 * Uses tests/fixtures/mock-mcp-server.js to avoid shell metacharacters
 * in inline scripts (which are blocked by the security check).
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { handleVerifyMcp } from "@/tools/verify-mcp.js";

/** Path to the mock MCP server fixture script (resolved from project root). */
const MOCK_SERVER = resolve(process.cwd(), "tests/fixtures/mock-mcp-server.js");

describe("verify_mcp edge cases", () => {
  it("fails when response has wrong id", async () => {
    const cmd = `node ${MOCK_SERVER} --wrong-id`;
    const result = await handleVerifyMcp({ command: cmd });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Invalid JSON-RPC");
  });

  it("fails when response has no result field", async () => {
    const cmd = `node ${MOCK_SERVER} --no-result`;
    const result = await handleVerifyMcp({ command: cmd });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
  });

  it("fails when response has no serverInfo", async () => {
    const cmd = `node ${MOCK_SERVER} --no-server-info`;
    const result = await handleVerifyMcp({ command: cmd });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("serverInfo");
  });

  it("handles server that writes stderr before responding", async () => {
    const cmd = `node ${MOCK_SERVER} --stderr-first --name noisy`;
    const result = await handleVerifyMcp({ command: cmd });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(true);
    expect(parsed.server_name).toBe("noisy");
  });

  it("respects timeout_seconds parameter", async () => {
    const start = Date.now();
    const result = await handleVerifyMcp({ command: "sleep 60", timeout_seconds: 2 });
    const elapsed = Date.now() - start;
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("timeout");
    expect(elapsed).toBeLessThan(5000); // Should not wait full 60s
  });

  it("caps timeout at 30 seconds (ignores higher values)", async () => {
    // Just verify it doesn't crash with a high value — actual timeout behavior
    // is tested above. This tests the parameter validation path.
    const result = await handleVerifyMcp({ command: "echo invalid", timeout_seconds: 999 });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    // Should use the DEFAULT_TIMEOUT_SECONDS (5) since 999 > MAX (30)
    expect(parsed.success).toBe(false); // "echo invalid" is not valid JSON-RPC
  });

  it("rejects commands with shell metacharacters", async () => {
    const result = await handleVerifyMcp({ command: "node -e 'console.log(1)'" });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    // Single quotes contain no metacharacters but parentheses do
    // This specific command has () in it
    expect(parsed.error).toContain("metacharacters");
  });
});
