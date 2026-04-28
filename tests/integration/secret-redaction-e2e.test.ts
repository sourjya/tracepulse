/**
 * End-to-end integration tests for secret redaction across the full pipeline.
 *
 * Verifies that secrets never appear in the ring buffer or MCP tool responses.
 * Feeds lines containing various secret formats through the real pipeline
 * (createPipeline → ring buffer), then queries via MCP handlers and inspects
 * every field that could leak sensitive data.
 *
 * @see src/pipeline/secret-redactor.ts for redaction patterns
 * @see src/constants/redaction.ts for REDACTION_REPLACEMENT
 * @see src/cli.ts for createPipeline
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPipeline } from "@/cli";
import { createRingBuffer } from "@/store/ring-buffer";
import { createDefaultRegistry } from "@/pipeline/parser-registry";
import { handleGetErrors, handleGetServerLogs } from "@/mcp/server";
import { REDACTION_REPLACEMENT } from "@/constants/redaction";
import type { EventBuffer } from "@/types/collectors";
import type { RuntimeEvent } from "@/types/events";

// ──────────────────────────────────────────────
// Test Helpers
// ──────────────────────────────────────────────

let buffer: EventBuffer;
let processLine: (source: "server-stdout" | "server-stderr", rawLine: string) => void;

beforeEach(() => {
  buffer = createRingBuffer();
  const registry = createDefaultRegistry();
  processLine = createPipeline(buffer, registry);
});

/**
 * Assert that a secret string does not appear in any field of any event
 * currently in the buffer. Checks message, raw, stack_trace, and
 * serialized context.
 */
function assertSecretNotInBuffer(secret: string): void {
  const events = buffer.query({});
  for (const event of events) {
    expect(event.message).not.toContain(secret);
    expect(event.raw).not.toContain(secret);
    if (event.stack_trace) {
      expect(event.stack_trace).not.toContain(secret);
    }
    expect(JSON.stringify(event.context)).not.toContain(secret);
  }
}

/**
 * Assert that a secret string does not appear in the JSON text returned
 * by an MCP tool handler result.
 */
function assertSecretNotInMcpResponse(
  result: { content: Array<{ type: string; text: string }> },
  secret: string,
): void {
  const text = result.content[0].text;
  expect(text).not.toContain(secret);
}

// ──────────────────────────────────────────────
// Secret Types
// ──────────────────────────────────────────────

/** Test cases: [label, raw line containing secret, the secret value to check for]. */
const SECRET_CASES: Array<[string, string, string]> = [
  [
    "AWS access key",
    "Error: Auth failed with key AKIAIOSFODNN7EXAMPLE",
    "AKIAIOSFODNN7EXAMPLE",
  ],
  [
    "connection string password",
    "DatabaseError: connecting to postgres://admin:s3cretP@ss@db.host:5432/mydb",
    "s3cretP@ss",
  ],
  [
    "GitHub token",
    "Error: push rejected, token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn",
    "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn",
  ],
  [
    "key-value secret",
    "Config loaded: password=hunter2 from env",
    "password=hunter2",
  ],
  [
    "Bearer token",
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123",
  ],
];

// ──────────────────────────────────────────────
// Buffer-Level Redaction
// ──────────────────────────────────────────────

describe("secrets never appear in the buffer", () => {
  it.each(SECRET_CASES)(
    "redacts %s from all event fields",
    (_label, line, secret) => {
      processLine("server-stderr", line);
      assertSecretNotInBuffer(secret);

      // Verify the redaction replacement is present somewhere
      const events = buffer.query({});
      const serialized = JSON.stringify(events[0]);
      expect(serialized).toContain(REDACTION_REPLACEMENT);
    },
  );

  it("redacts multiple secrets in a single line", () => {
    const line =
      "Error: AKIAIOSFODNN7EXAMPLE connecting to postgres://root:p@ssw0rd@host/db";
    const secrets = ["AKIAIOSFODNN7EXAMPLE", "p@ssw0rd"];

    processLine("server-stderr", line);

    for (const secret of secrets) {
      assertSecretNotInBuffer(secret);
    }
  });
});

// ──────────────────────────────────────────────
// MCP Response-Level Redaction
// ──────────────────────────────────────────────

describe("secrets never appear in MCP tool responses", () => {
  it("get_errors response contains no secrets", () => {
    for (const [, line] of SECRET_CASES) {
      processLine("server-stderr", line);
    }

    const result = handleGetErrors(buffer, {});
    for (const [, , secret] of SECRET_CASES) {
      assertSecretNotInMcpResponse(result, secret);
    }
  });

  it("get_server_logs response contains no secrets", () => {
    for (const [, line] of SECRET_CASES) {
      processLine("server-stderr", line);
    }

    const result = handleGetServerLogs(buffer, {});
    for (const [, , secret] of SECRET_CASES) {
      assertSecretNotInMcpResponse(result, secret);
    }
  });
});
