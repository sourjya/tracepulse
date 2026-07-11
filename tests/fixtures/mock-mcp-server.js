#!/usr/bin/env node
/**
 * Mock MCP server for verify_mcp tests.
 *
 * Reads JSON-RPC from stdin, responds with a valid initialize result.
 * Accepts CLI args to customize behavior:
 *   --name <name>     Server name (default: "test-srv")
 *   --version <ver>   Server version (default: "1.2.3")
 *   --capabilities    Include tools+resources capabilities
 *   --wrong-id        Respond with id=99 instead of id=1
 *   --no-server-info  Omit serverInfo from response
 *   --no-result       Return an error response instead of result
 *   --stderr-first    Write to stderr before responding
 */

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

const serverName = getArg("--name") || "test-srv";
const serverVersion = getArg("--version") || "1.2.3";
const includeCapabilities = hasFlag("--capabilities");
const wrongId = hasFlag("--wrong-id");
const noServerInfo = hasFlag("--no-server-info");
const noResult = hasFlag("--no-result");
const stderrFirst = hasFlag("--stderr-first");

if (stderrFirst) {
  process.stderr.write("loading...\n");
}

process.stdin.on("data", () => {
  const id = wrongId ? 99 : 1;

  if (noResult) {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code: -1, message: "fail" },
    }));
    process.exit(0);
    return;
  }

  const result = {
    protocolVersion: "2024-11-05",
    capabilities: includeCapabilities
      ? { tools: {}, resources: {} }
      : {},
  };

  if (!noServerInfo) {
    result.serverInfo = { name: serverName, version: serverVersion };
  }

  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }));
  process.exit(0);
});
