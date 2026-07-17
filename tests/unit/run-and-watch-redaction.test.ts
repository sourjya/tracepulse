/**
 * Tests that run_and_watch redacts secrets from raw_output before returning
 * it to the agent (TM-03 / TRP-54), with a length hint (F6) so the agent still
 * sees that a value was present and how long — and WITHOUT over-redacting
 * ordinary output (the debugging value the tool exists for).
 *
 * @see src/tools/run-and-watch.ts
 * @see src/pipeline/secret-redactor.ts (redactWithHint)
 * @see .kiro/specs/m28-safe-command-execution/ (Feature 2, F6)
 */

import { describe, it, expect } from "vitest";
import { handleRunAndWatch } from "@/tools/run-and-watch.js";

const parse = (r: unknown) =>
  JSON.parse((r as { content: Array<{ text: string }> }).content[0].text);

describe("run_and_watch raw_output redaction (TM-03 / F6)", () => {
  it("redacts secrets with a length hint", async () => {
    const parsed = parse(
      await handleRunAndWatch({
        command: "node tests/fixtures/print-secret.cjs",
        timeout_seconds: 10,
      }),
    );
    expect(parsed.exit_code).toBe(0);
    expect(parsed.raw_output).not.toContain("AKIAIOSFODNN7EXAMPLE");
    // F6: length hint, not an opaque blank.
    expect(parsed.raw_output).toMatch(/\[REDACTED:\d+\]/);
  });

  it("also redacts on the max_lines path", async () => {
    const parsed = parse(
      await handleRunAndWatch({
        command: "node tests/fixtures/print-secret.cjs",
        max_lines: 5,
        timeout_seconds: 10,
      }),
    );
    expect(parsed.raw_output).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("does NOT over-redact ordinary output", async () => {
    const parsed = parse(
      await handleRunAndWatch({ command: "node --version", timeout_seconds: 5 }),
    );
    expect(parsed.exit_code).toBe(0);
    expect(parsed.raw_output.length).toBeGreaterThan(0);
    expect(parsed.raw_output).not.toContain("[REDACTED");
  });
});
