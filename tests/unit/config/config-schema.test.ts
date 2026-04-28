/**
 * Unit tests for config schema validation.
 *
 * @see src/config/config-schema.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { validateConfig } from "@/config/config-schema.js";

describe("config schema validation", () => {
  it("valid config with services array passes", () => {
    const result = validateConfig({
      services: [{ name: "api", command: "npm run dev" }],
    });
    expect(result.valid).toBe(true);
    expect(result.config!.services).toHaveLength(1);
  });

  it("valid config with compose section passes", () => {
    const result = validateConfig({
      compose: { file: "docker-compose.yml" },
    });
    expect(result.valid).toBe(true);
    expect(result.config!.compose).toBeDefined();
  });

  it("empty config (all optional) passes", () => {
    const result = validateConfig({});
    expect(result.valid).toBe(true);
  });

  it("duplicate service names rejected", () => {
    const result = validateConfig({
      services: [
        { name: "api", command: "cmd1" },
        { name: "api", command: "cmd2" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("duplicate");
  });

  it("empty service name rejected", () => {
    const result = validateConfig({
      services: [{ name: "", command: "cmd" }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("name");
  });

  it("empty service command rejected", () => {
    const result = validateConfig({
      services: [{ name: "api", command: "" }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("command");
  });

  it("service name with invalid characters rejected", () => {
    const result = validateConfig({
      services: [{ name: "My Service!", command: "cmd" }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("name");
  });

  it("correlation_window_ms outside 100-10000 rejected", () => {
    expect(validateConfig({ correlation_window_ms: 50 }).valid).toBe(false);
    expect(validateConfig({ correlation_window_ms: 20000 }).valid).toBe(false);
    expect(validateConfig({ correlation_window_ms: 2000 }).valid).toBe(true);
  });

  it("transport.http_port outside 1024-65535 rejected", () => {
    expect(validateConfig({ transport: { http_port: 80 } }).valid).toBe(false);
    expect(validateConfig({ transport: { http_port: 70000 } }).valid).toBe(false);
    expect(validateConfig({ transport: { http_port: 9800 } }).valid).toBe(true);
  });

  it("services + compose together rejected (mutually exclusive)", () => {
    const result = validateConfig({
      services: [{ name: "api", command: "cmd" }],
      compose: { file: "docker-compose.yml" },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mutually exclusive");
  });
});
