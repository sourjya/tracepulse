/**
 * run_and_watch cwd visibility (TRP-57, TM-12).
 *
 * Running a command in an absolute cwd outside the project root is a documented
 * capability (the tool suggests it), so it is NOT blocked — but it is surfaced
 * to the agent via `cwd_outside_project_root` for visibility/audit. A relative
 * path escaping the root remains rejected (SRR-003 H-002).
 *
 * @see src/tools/run-and-watch.ts
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { handleRunAndWatch } from "@/tools/run-and-watch.js";

describe("run_and_watch cwd audit (TRP-57)", () => {
  it("runs a command in an absolute cwd outside the project root but flags it", async () => {
    const outsideRoot = resolve(process.cwd(), ".."); // absolute, exists, outside root
    const result = await handleRunAndWatch({
      command: "node --version",
      cwd: outsideRoot,
      timeout_seconds: 5,
    });
    const parsed = JSON.parse(
      (result as { content: Array<{ text: string }> }).content[0].text,
    );
    expect(parsed.exit_code).toBe(0); // capability preserved — still runs
    expect(parsed.cwd_outside_project_root).toBe(true);
  });

  it("does not flag commands run inside the project root", async () => {
    const result = await handleRunAndWatch({
      command: "node --version",
      timeout_seconds: 5,
    });
    const parsed = JSON.parse(
      (result as { content: Array<{ text: string }> }).content[0].text,
    );
    expect(parsed.cwd_outside_project_root).toBeUndefined();
  });
});
