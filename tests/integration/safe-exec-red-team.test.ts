/**
 * Safe Agent Command Execution — Phase A red-team / bypass suite (F9 DoD gate).
 *
 * Adversarial checks that the containment + sanitization controls actually hold
 * against the attacks they exist to stop. Consolidated gate for TRP-54/55/56/57.
 *
 * @see .kiro/specs/m28-safe-command-execution/spec-review.md (F9)
 */

import { describe, it, expect } from "vitest";
import { handleRunAndWatch } from "@/tools/run-and-watch.js";

type ToolText = { content: Array<{ text: string }>; isError?: boolean };
const parse = (r: unknown) => JSON.parse((r as ToolText).content[0].text);

describe("safe-exec Phase A red-team / bypass suite", () => {
  it("`bash -c env` cannot harvest secret-shaped env vars (TRP-55)", async () => {
    process.env.TP_REDTEAM_SECRET_KEY = "leakme1234567890";
    try {
      const result = await handleRunAndWatch({ command: "bash -c env", timeout_seconds: 10 });
      const out = parse(result).raw_output ?? "";
      expect(out).not.toContain("TP_REDTEAM_SECRET_KEY");
      expect(out).not.toContain("leakme1234567890");
    } finally {
      delete process.env.TP_REDTEAM_SECRET_KEY;
    }
  });

  it("a secret printed by a command does not leak verbatim to the agent (TRP-54)", async () => {
    const result = await handleRunAndWatch({
      command: "node tests/fixtures/print-secret.cjs",
      timeout_seconds: 10,
    });
    expect(parse(result).raw_output ?? "").not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("shell metacharacter chaining is rejected", async () => {
    const result = await handleRunAndWatch({
      command: "node --version; echo chained",
      timeout_seconds: 5,
    });
    expect((result as ToolText).isError).toBe(true);
  });

  it("relative cwd escaping the project root is rejected (SRR-003 H-002)", async () => {
    const result = await handleRunAndWatch({
      command: "node --version",
      cwd: "../../../etc",
      timeout_seconds: 5,
    });
    expect((result as ToolText).isError).toBe(true);
  });
});
