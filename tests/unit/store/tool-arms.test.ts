/**
 * Tests for the tool→arm classification module (TRP-82).
 *
 * Two independent axes (F3): arm classification (tp/shell) and token-attribution
 * eligibility. verify_fix is shell-arm AND not token-attributable.
 */

import { describe, it, expect } from "vitest";
import {
  classifyArm,
  mergeArm,
  isTokenAttributable,
  TP_ARM_TOOLS,
  SHELL_ARM_TOOLS,
  TOKEN_ATTRIB_TOOLS,
  type Arm,
} from "@/store/tool-arms.js";

describe("classifyArm", () => {
  it("classifies read/investigation tools as tp", () => {
    expect(classifyArm("get_error_context")).toBe("tp");
    expect(classifyArm("get_prompt_context")).toBe("tp");
    expect(classifyArm("acknowledge_error")).toBe("tp");
    expect(classifyArm("get_errors")).toBe("tp");
  });

  it("classifies child-process tools as shell", () => {
    expect(classifyArm("run_and_watch")).toBe("shell");
    expect(classifyArm("verify_build")).toBe("shell");
    expect(classifyArm("verify_loop")).toBe("shell");
    expect(classifyArm("start_server")).toBe("shell");
  });

  it("classifies verify_fix as shell (NOT tp), even though it is fingerprint-bearing (F3)", () => {
    expect(classifyArm("verify_fix")).toBe("shell");
  });

  it("returns null for unknown / neutral tools", () => {
    expect(classifyArm("get_session_insights")).toBeNull();
    expect(classifyArm("totally_made_up_tool")).toBeNull();
  });
});

describe("isTokenAttributable", () => {
  it("is true only for the three fingerprint-bearing read tools", () => {
    expect(isTokenAttributable("get_error_context")).toBe(true);
    expect(isTokenAttributable("get_prompt_context")).toBe(true);
    expect(isTokenAttributable("acknowledge_error")).toBe(true);
  });

  it("is false for shell tools including verify_fix (F3)", () => {
    expect(isTokenAttributable("verify_fix")).toBe(false);
    expect(isTokenAttributable("run_and_watch")).toBe(false);
  });

  it("is false for surfacing / neutral tools (no single fingerprint)", () => {
    expect(isTokenAttributable("get_errors")).toBe(false);
    expect(isTokenAttributable("get_session_insights")).toBe(false);
  });

  it("every token-attributable tool is also a tp-arm tool", () => {
    for (const tool of TOKEN_ATTRIB_TOOLS) {
      expect(classifyArm(tool)).toBe("tp");
    }
  });
});

describe("mergeArm", () => {
  it("promotes none → the incoming arm", () => {
    expect(mergeArm("none", "tp")).toBe("tp");
    expect(mergeArm("none", "shell")).toBe("shell");
  });

  it("keeps the arm unchanged when the incoming arm matches", () => {
    expect(mergeArm("tp", "tp")).toBe("tp");
    expect(mergeArm("shell", "shell")).toBe("shell");
  });

  it("promotes to mixed when the two arms differ", () => {
    expect(mergeArm("tp", "shell")).toBe("mixed");
    expect(mergeArm("shell", "tp")).toBe("mixed");
  });

  it("stays mixed once mixed", () => {
    expect(mergeArm("mixed", "tp")).toBe("mixed");
    expect(mergeArm("mixed", "shell")).toBe("mixed");
  });
});

describe("arm sets are disjoint and consistent", () => {
  it("no tool is in both TP_ARM_TOOLS and SHELL_ARM_TOOLS", () => {
    const overlap = [...TP_ARM_TOOLS].filter((t) => SHELL_ARM_TOOLS.has(t));
    expect(overlap).toEqual([]);
  });

  it("Arm type covers the four documented values", () => {
    const arms: Arm[] = ["tp", "shell", "mixed", "none"];
    expect(arms).toHaveLength(4);
  });
});
