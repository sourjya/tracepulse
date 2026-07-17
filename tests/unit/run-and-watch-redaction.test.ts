/**
 * Tests that run_and_watch redacts secrets from raw_output before returning
 * it to the agent (TM-03 / TRP-54). Previously only the parsed errors[] were
 * redacted; raw_output was returned verbatim, leaking secrets a command printed.
 *
 * @see src/tools/run-and-watch.ts
 * @see .kiro/specs/m28-safe-command-execution/ (Feature 2)
 */

import { describe, it, expect } from "vitest";
import { handleRunAndWatch } from "@/tools/run-and-watch.js";

describe("run_and_watch raw_output redaction (TM-03)", () => {
  it("redacts secrets printed by a command from raw_output", async () => {
    const result = await handleRunAndWatch({
      command: "node tests/fixtures/print-secret.cjs",
      timeout_seconds: 10,
    });
    const parsed = JSON.parse(
      (result as { content: Array<{ text: string }> }).content[0].text,
    );

    expect(parsed.exit_code).toBe(0);
    // The raw AWS key must NOT reach the agent context verbatim.
    expect(parsed.raw_output).not.toContain("AKIAIOSFODNN7EXAMPLE");
    // It must be redacted.
    expect(parsed.raw_output).toContain("[REDACTED]");
  });
});
