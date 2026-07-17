/**
 * The env-scrub escape valve (TRP-55): the agent can DECLARE env vars (which
 * always pass through) and can OPT OUT via inherit_env. Without a working,
 * discoverable escape valve, env-scrub would be a capability regression for any
 * command that legitimately needs an env var.
 *
 * @see src/tools/run-and-watch.ts
 * @see src/tools/exec-env.ts
 */

import { describe, it, expect, afterAll } from "vitest";
import { handleRunAndWatch } from "@/tools/run-and-watch.js";

const parse = (r: unknown) =>
  JSON.parse((r as { content: Array<{ text: string }> }).content[0].text);

describe("run_and_watch env escape valve (TRP-55)", () => {
  afterAll(() => {
    delete process.env.TP_TEST_SECRET;
  });

  it("passes an agent-declared env var through to the command", async () => {
    const parsed = parse(
      await handleRunAndWatch({
        command: "node tests/fixtures/print-env-var.cjs",
        env: { TP_TEST_PLAIN: "declared-value" },
        timeout_seconds: 10,
      }),
    );
    expect(parsed.raw_output).toContain("marker-b:declared-value");
  });

  it("inherit_env opts back into the full environment (secret var not scrubbed)", async () => {
    process.env.TP_TEST_SECRET = "optedin";
    const parsed = parse(
      await handleRunAndWatch({
        command: "node tests/fixtures/print-env-var.cjs",
        inherit_env: true,
        timeout_seconds: 10,
      }),
    );
    expect(parsed.raw_output).toContain("marker-a:optedin");
  });
});
