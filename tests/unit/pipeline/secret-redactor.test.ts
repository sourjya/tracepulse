/**
 * Unit tests for the secret redactor pipeline stage.
 *
 * The secret redactor is the first stage in the pipeline — every raw log line
 * passes through it before parsing or storage. These tests verify that common
 * credential formats are redacted while non-secret content is preserved.
 *
 * @see src/constants/redaction.ts for pattern definitions
 */

import { describe, it, expect } from "vitest";
import { redact } from "@/pipeline/secret-redactor";

describe("redact", () => {
  // ──────────────────────────────────────────────
  // API Keys
  // ──────────────────────────────────────────────

  it("redacts OpenAI-style sk- API keys", () => {
    expect(redact("key: sk-abc123def456ghi789jkl012mno345")).toContain(
      "[REDACTED]",
    );
    expect(redact("key: sk-abc123def456ghi789jkl012mno345")).not.toContain(
      "sk-abc123",
    );
  });

  it("redacts sk_live_ and sk_test_ keys", () => {
    expect(redact("sk_live_" + "x".repeat(24))).toContain(
      "[REDACTED]",
    );
    expect(redact("sk_test_" + "x".repeat(24))).toContain(
      "[REDACTED]",
    );
  });

  it("redacts AWS access key IDs", () => {
    const line = "aws_key=AKIAIOSFODNN7EXAMPLE";
    const result = redact(line);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  // ──────────────────────────────────────────────
  // Bearer and Basic Auth
  // ──────────────────────────────────────────────

  it("redacts Bearer tokens", () => {
    const line = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig";
    const result = redact(line);
    expect(result).toContain("Bearer [REDACTED]");
    expect(result).not.toContain("eyJhbGci");
  });

  it("redacts Basic auth", () => {
    const line = "Authorization: Basic dXNlcjpwYXNzd29yZA==";
    const result = redact(line);
    expect(result).toContain("Basic [REDACTED]");
    expect(result).not.toContain("dXNlcjpwYXNzd29yZA==");
  });

  // ──────────────────────────────────────────────
  // Key-Value Secrets
  // ──────────────────────────────────────────────

  it("redacts password=value patterns", () => {
    const result = redact("password=hunter2");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("hunter2");
  });

  it("redacts secret: value patterns", () => {
    const result = redact("secret: my-super-secret-value");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("my-super-secret-value");
  });

  it("redacts token=value patterns", () => {
    const result = redact("token=abc123xyz");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("abc123xyz");
  });

  it("redacts api_key=value patterns", () => {
    const result = redact("api_key=my-api-key-value");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("my-api-key-value");
  });

  // ──────────────────────────────────────────────
  // Connection Strings
  // ──────────────────────────────────────────────

  it("redacts credentials in connection strings", () => {
    const line = "postgres://admin:secretpass@localhost:5432/mydb";
    const result = redact(line);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("secretpass");
  });

  it("redacts credentials in mongodb connection strings", () => {
    const line = "mongodb://user:p4ssw0rd@cluster.mongodb.net/db";
    const result = redact(line);
    expect(result).not.toContain("p4ssw0rd");
  });

  // ──────────────────────────────────────────────
  // PEM Keys
  // ──────────────────────────────────────────────

  it("redacts PEM private key markers", () => {
    const line = "-----BEGIN RSA PRIVATE KEY-----";
    const result = redact(line);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("PRIVATE KEY");
  });

  it("redacts EC private key markers", () => {
    const result = redact("-----BEGIN EC PRIVATE KEY-----");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts generic private key markers", () => {
    const result = redact("-----BEGIN PRIVATE KEY-----");
    expect(result).toContain("[REDACTED]");
  });

  // ──────────────────────────────────────────────
  // JWT Tokens
  // ──────────────────────────────────────────────

  it("redacts JWT tokens", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const result = redact(`token: ${jwt}`);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("eyJhbGci");
  });

  // ──────────────────────────────────────────────
  // Platform-Specific Tokens
  // ──────────────────────────────────────────────

  it("redacts GitHub personal access tokens (ghp_)", () => {
    const result = redact(
      "GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn",
    );
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("ghp_");
  });

  it("redacts GitHub OAuth tokens (gho_)", () => {
    const result = redact(
      "token=gho_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn",
    );
    expect(result).toContain("[REDACTED]");
  });

  it("redacts GitLab tokens (glpat-)", () => {
    const result = redact("GITLAB_TOKEN=glpat-abcdefghijklmnopqrstuvwxyz");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("glpat-");
  });

  it("redacts Slack bot tokens (xoxb-)", () => {
    const result = redact("SLACK_TOKEN=xoxb-123456789-abcdefghij");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("xoxb-");
  });

  it("redacts Slack user tokens (xoxp-)", () => {
    const result = redact("token=xoxp-123456789-abcdefghij");
    expect(result).toContain("[REDACTED]");
  });

  // ──────────────────────────────────────────────
  // Non-Secret Content Preservation
  // ──────────────────────────────────────────────

  it("does NOT modify normal log lines", () => {
    const line = "2026-04-27T12:00:00Z [INFO] Server started on port 3000";
    expect(redact(line)).toBe(line);
  });

  it("does NOT modify stack traces without secrets", () => {
    const line =
      "    at AuthService.validate (/app/src/auth.ts:42:15)";
    expect(redact(line)).toBe(line);
  });

  it("does NOT modify error messages without secrets", () => {
    const line = "TypeError: Cannot read properties of undefined (reading 'token')";
    expect(redact(line)).toBe(line);
  });

  it("does NOT modify URLs without credentials", () => {
    const line = "Connecting to https://api.example.com/v1/users";
    expect(redact(line)).toBe(line);
  });

  // ──────────────────────────────────────────────
  // Multiple Secrets
  // ──────────────────────────────────────────────

  it("redacts multiple secrets in one line", () => {
    const line =
      "password=hunter2 token=abc123xyz api_key=my-key";
    const result = redact(line);
    expect(result).not.toContain("hunter2");
    expect(result).not.toContain("abc123xyz");
    expect(result).not.toContain("my-key");
  });

  // ──────────────────────────────────────────────
  // Edge Cases
  // ──────────────────────────────────────────────

  it("handles empty string", () => {
    expect(redact("")).toBe("");
  });

  it("handles string with null bytes", () => {
    const line = "normal text\x00more text";
    // Should not throw
    const result = redact(line);
    expect(typeof result).toBe("string");
  });
});
