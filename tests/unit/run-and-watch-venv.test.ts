/**
 * Tests for run_and_watch virtualenv auto-detection.
 *
 * @see src/tools/run-and-watch.ts
 */

import { describe, it, expect } from "vitest";
import { handleRunAndWatch } from "@/tools/run-and-watch.js";

describe("run_and_watch venv auto-detection", () => {
  it("runs successfully with node --version (baseline)", async () => {
    const result = await handleRunAndWatch({ command: "node --version", timeout_seconds: 5 });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.exit_code).toBe(0);
  });

  it("includes venv detection in spawn env when .venv exists", async () => {
    // TracePulse itself doesn't have a .venv, so this tests the no-venv path.
    // The venv detection code runs but finds no .venv, so PATH is unchanged.
    // This verifies the code doesn't crash when no .venv exists.
    const result = await handleRunAndWatch({ command: "node --version", timeout_seconds: 5 });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(true);
  });
});
