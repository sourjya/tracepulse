/**
 * Tests for auto-correlation of errors with recent file edits.
 *
 * When get_errors returns events, errors with file context should be
 * enriched with likely_cause if the file was recently modified.
 *
 * @see src/correlation/auto-correlator.ts
 * @see .kiro/specs/m26-intelligent-feedback/requirements.md Feature 5
 */

import { describe, it, expect } from "vitest";
import { autoCorrelate, type LikelyCause } from "@/correlation/auto-correlator.js";

describe("autoCorrelate", () => {
  it("returns likely_cause when error file matches a changed file", () => {
    const result = autoCorrelate(
      { file: "src/auth/login.ts", line: 42 },
      ["src/auth/login.ts", "src/utils/helpers.ts"],
    );
    expect(result).not.toBeNull();
    expect(result!.file).toBe("src/auth/login.ts");
  });

  it("returns null when error file does not match any changed file", () => {
    const result = autoCorrelate(
      { file: "src/auth/login.ts", line: 42 },
      ["src/utils/helpers.ts", "README.md"],
    );
    expect(result).toBeNull();
  });

  it("returns null when error has no file context", () => {
    const result = autoCorrelate(
      { file: undefined },
      ["src/auth/login.ts"],
    );
    expect(result).toBeNull();
  });

  it("returns null when no changed files", () => {
    const result = autoCorrelate(
      { file: "src/auth/login.ts", line: 42 },
      [],
    );
    expect(result).toBeNull();
  });

  it("matches partial paths (error has relative, changed has full)", () => {
    const result = autoCorrelate(
      { file: "auth/login.ts", line: 10 },
      ["src/auth/login.ts"],
    );
    expect(result).not.toBeNull();
    expect(result!.file).toBe("src/auth/login.ts");
  });
});
