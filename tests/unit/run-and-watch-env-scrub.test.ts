/**
 * Integration test: run_and_watch does not leak secret-shaped env vars to the
 * spawned command (TRP-55, SRR-003 M-003). Previously the child inherited the
 * full process.env, so `bash -c env` could harvest every developer secret.
 *
 * @see src/tools/run-and-watch.ts
 * @see src/tools/exec-env.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { handleRunAndWatch } from "@/tools/run-and-watch.js";

describe("run_and_watch env scrub (TRP-55)", () => {
  beforeAll(() => {
    process.env.TP_TEST_SECRET = "topsecretvalue"; // secret-shaped NAME
    process.env.TP_TEST_PLAIN = "helloworld";      // ordinary var
  });
  afterAll(() => {
    delete process.env.TP_TEST_SECRET;
    delete process.env.TP_TEST_PLAIN;
  });

  it("drops secret-named vars but keeps ordinary ones", async () => {
    const result = await handleRunAndWatch({
      command: "node tests/fixtures/print-env-var.cjs",
      timeout_seconds: 10,
    });
    const parsed = JSON.parse(
      (result as { content: Array<{ text: string }> }).content[0].text,
    );
    expect(parsed.exit_code).toBe(0);
    expect(parsed.raw_output).toContain("marker-a:MISSING");     // secret dropped
    expect(parsed.raw_output).toContain("marker-b:helloworld");  // ordinary kept
  });
});
