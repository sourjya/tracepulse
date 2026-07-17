/**
 * verify_mcp containment/sanitization parity (TRP-56, TM-01).
 *
 * verify_mcp spawned commands directly, inheriting the full process.env and
 * folding un-redacted child stderr into its error messages. It now gets the
 * same env-scrub (TRP-55) and output-redaction (TRP-54) as run_and_watch.
 * (Allowlist/classifier parity is Phase B — TRP-59 — to avoid breaking
 * legitimate server commands.)
 *
 * @see src/tools/verify-mcp.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { handleVerifyMcp } from "@/tools/verify-mcp.js";

describe("verify_mcp containment + sanitization parity (TRP-56)", () => {
  beforeAll(() => {
    process.env.TP_TEST_SECRET = "topsecretvalue";
  });
  afterAll(() => {
    delete process.env.TP_TEST_SECRET;
  });

  it("scrubs secret-shaped env vars and redacts child output in error messages", async () => {
    const result = await handleVerifyMcp({
      command: "node tests/fixtures/verify-print-env.cjs",
      timeout_seconds: 5,
    });
    const parsed = JSON.parse(
      (result as { content: Array<{ text: string }> }).content[0].text,
    );
    expect(parsed.success).toBe(false);
    // env scrubbed: the secret-named var is not passed to the child.
    expect(parsed.error).toContain("envmarker:MISSING");
    // output redacted: a secret in the child's stderr does not leak to the agent.
    expect(parsed.error).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(parsed.error).toContain("[REDACTED]");
  });
});
