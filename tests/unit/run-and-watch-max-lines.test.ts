/**
 * Tests for max_lines parameter on run_and_watch.
 *
 * @see src/tools/run-and-watch.ts
 */

import { describe, it, expect } from "vitest";
import { handleRunAndWatch } from "@/tools/run-and-watch.js";

describe("run_and_watch max_lines", () => {
  it("includes raw_output in response", async () => {
    const result = await handleRunAndWatch({
      command: "node --version",
      timeout_seconds: 5,
    });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.exit_code).toBe(0);
    expect(parsed.raw_output).toBeDefined();
    expect(parsed.raw_output.length).toBeGreaterThan(0);
  });

  it("does not set output_truncated when within max_lines", async () => {
    const result = await handleRunAndWatch({
      command: "node --version",
      timeout_seconds: 5,
      max_lines: 100,
    });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.output_truncated).toBeFalsy();
  });
});
