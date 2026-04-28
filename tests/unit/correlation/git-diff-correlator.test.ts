/**
 * Unit tests for git diff correlator.
 *
 * @see src/correlation/git-diff-correlator.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import {
  parseChangedFiles,
  parseDiffHunks,
  matchErrorToFile,
} from "@/correlation/git-diff-correlator.js";

describe("parseChangedFiles", () => {
  it("extracts file list from git diff --name-only output", () => {
    const output = "src/auth.ts\nsrc/utils.ts\npackage.json\n";
    expect(parseChangedFiles(output)).toEqual(["src/auth.ts", "src/utils.ts", "package.json"]);
  });

  it("handles empty output", () => {
    expect(parseChangedFiles("")).toEqual([]);
    expect(parseChangedFiles("\n")).toEqual([]);
  });
});

describe("parseDiffHunks", () => {
  it("extracts line ranges from unified diff", () => {
    const diff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,5 +10,7 @@ function login() {
+  const x = 1;
+  const y = 2;
`;
    const hunks = parseDiffHunks(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].file).toBe("src/auth.ts");
    expect(hunks[0].startLine).toBe(10);
    expect(hunks[0].lineCount).toBe(7);
  });
});

describe("matchErrorToFile", () => {
  it("matches error file to changed file", () => {
    expect(matchErrorToFile("src/auth.ts", ["src/auth.ts", "src/utils.ts"])).toBe("src/auth.ts");
  });

  it("returns null when error has no file", () => {
    expect(matchErrorToFile(undefined, ["src/auth.ts"])).toBeNull();
  });

  it("returns null when no match", () => {
    expect(matchErrorToFile("src/other.ts", ["src/auth.ts"])).toBeNull();
  });

  it("handles leading ./ in error file", () => {
    expect(matchErrorToFile("./src/auth.ts", ["src/auth.ts"])).toBe("src/auth.ts");
  });
});
