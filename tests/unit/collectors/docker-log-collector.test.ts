/**
 * Unit tests for Docker log collector.
 *
 * Tests Docker multiplexed stream parsing, service name extraction,
 * and graceful error handling. Uses mocked HTTP responses since
 * Docker socket is not available in test environments.
 *
 * @see src/collectors/docker-log-collector.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import {
  parseDockerLogFrame,
  extractServiceFromLabels,
} from "@/collectors/docker-log-collector.js";

describe("Docker log frame parsing", () => {
  it("parses stdout stream type (0x01) correctly", () => {
    // Docker multiplexed format: 8-byte header + payload
    // Header: [stream_type, 0, 0, 0, size_byte3, size_byte2, size_byte1, size_byte0]
    const payload = "hello from container\n";
    const header = Buffer.alloc(8);
    header[0] = 1; // stdout
    header.writeUInt32BE(payload.length, 4);
    const frame = Buffer.concat([header, Buffer.from(payload)]);

    const result = parseDockerLogFrame(frame);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("server-stdout");
    expect(result!.line).toBe("hello from container");
  });

  it("parses stderr stream type (0x02) correctly", () => {
    const payload = "error message\n";
    const header = Buffer.alloc(8);
    header[0] = 2; // stderr
    header.writeUInt32BE(payload.length, 4);
    const frame = Buffer.concat([header, Buffer.from(payload)]);

    const result = parseDockerLogFrame(frame);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("server-stderr");
    expect(result!.line).toBe("error message");
  });

  it("returns null for frames shorter than 8 bytes", () => {
    expect(parseDockerLogFrame(Buffer.alloc(4))).toBeNull();
  });

  it("strips trailing newline from payload", () => {
    const payload = "line with newline\n";
    const header = Buffer.alloc(8);
    header[0] = 1;
    header.writeUInt32BE(payload.length, 4);
    const frame = Buffer.concat([header, Buffer.from(payload)]);

    const result = parseDockerLogFrame(frame);
    expect(result!.line).toBe("line with newline");
  });
});

describe("extractServiceFromLabels", () => {
  it("extracts service name from compose labels", () => {
    const labels = { "com.docker.compose.service": "api" };
    expect(extractServiceFromLabels(labels)).toBe("api");
  });

  it("returns undefined when label is missing", () => {
    expect(extractServiceFromLabels({})).toBeUndefined();
    expect(extractServiceFromLabels({ other: "value" })).toBeUndefined();
  });
});
