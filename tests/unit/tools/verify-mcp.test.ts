/**
 * Tests for the verify_mcp MCP tool handler.
 *
 * Verifies that the tool sends an initialize handshake to a command,
 * parses the JSON-RPC response, and returns structured pass/fail.
 */

import { describe, it, expect } from "vitest";
import { handleVerifyMcp, buildInitializeMessage } from "@/tools/verify-mcp.js";

describe("buildInitializeMessage", () => {
  it("returns valid JSON-RPC initialize message", () => {
    const msg = buildInitializeMessage();
    const parsed = JSON.parse(msg);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.id).toBe(1);
    expect(parsed.method).toBe("initialize");
    expect(parsed.params.protocolVersion).toBe("2024-11-05");
    expect(parsed.params.clientInfo.name).toBe("tracepulse-verify");
  });
});

describe("handleVerifyMcp", () => {
  it("returns error when command is missing", async () => {
    const result = await handleVerifyMcp({});
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("command");
  });

  it("returns failure for a command that exits immediately with error", async () => {
    const result = await handleVerifyMcp({ command: "exit 1" });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
  });

  it("returns failure for a command that outputs non-JSON", async () => {
    const result = await handleVerifyMcp({ command: "echo hello" });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("parse");
  });

  it("returns success for a valid MCP server response", async () => {
    // Node script that reads stdin and responds with valid initialize result
    const cmd = `node -e 'process.stdin.on("data",()=>{process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:1,result:{protocolVersion:"2024-11-05",capabilities:{},serverInfo:{name:"test-srv",version:"1.2.3"}}}));process.exit(0)})'`;
    const result = await handleVerifyMcp({ command: cmd });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(true);
    expect(parsed.server_name).toBe("test-srv");
    expect(parsed.server_version).toBe("1.2.3");
    expect(parsed.protocol_version).toBe("2024-11-05");
    expect(parsed.duration_ms).toBeGreaterThan(0);
  });

  it("returns failure on timeout", async () => {
    // sleep hangs and produces no output
    const result = await handleVerifyMcp({ command: "sleep 10", timeout_seconds: 1 });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("timeout");
  });

  it("includes capabilities when present in response", async () => {
    const cmd = `node -e 'process.stdin.on("data",()=>{process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:1,result:{protocolVersion:"2024-11-05",capabilities:{tools:{},resources:{}},serverInfo:{name:"rich",version:"2.0"}}}));process.exit(0)})'`;
    const result = await handleVerifyMcp({ command: cmd });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(true);
    expect(parsed.capabilities).toHaveProperty("tools");
    expect(parsed.capabilities).toHaveProperty("resources");
  });
});
