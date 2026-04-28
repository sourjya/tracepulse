/**
 * Unit tests for HTTP transport setup.
 *
 * Tests that the HTTP transport binds correctly and respects configuration.
 * Does not test actual MCP protocol over HTTP (that's an integration test).
 *
 * @see src/transport/http-transport.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { createHttpTransport } from "@/transport/http-transport.js";
import { DEFAULT_HTTP_PORT } from "@/constants/services.js";

describe("HTTP transport", () => {
  it("creates transport with default port", () => {
    const transport = createHttpTransport();
    expect(transport.port).toBe(DEFAULT_HTTP_PORT);
  });

  it("creates transport with custom port", () => {
    const transport = createHttpTransport(9801);
    expect(transport.port).toBe(9801);
  });

  it("binds to 127.0.0.1 only", () => {
    const transport = createHttpTransport();
    expect(transport.host).toBe("127.0.0.1");
  });

  it("server is not started until start() is called", () => {
    const transport = createHttpTransport();
    expect(transport.isListening()).toBe(false);
  });
});
