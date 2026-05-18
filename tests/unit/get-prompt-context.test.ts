/**
 * Tests for get_prompt_context — pre-assembled reasoning packet.
 *
 * Assembles error + stack + surrounding logs + file snippet + git diff
 * into a token-budgeted context block for the agent to reason over.
 *
 * @see src/tools/get-prompt-context.ts
 * @see .kiro/specs/m26-intelligent-feedback/requirements.md Feature 2
 */

import { describe, it, expect } from "vitest";
import { assembleContext, type PromptContextInput } from "@/tools/get-prompt-context.js";

describe("assembleContext", () => {
  const baseInput: PromptContextInput = {
    error: { message: "TypeError: Cannot read properties of null", stack_trace: "at login (src/auth.ts:42)\nat handler (src/routes.ts:10)" },
    surroundingLogs: ["[INFO] Request received GET /login", "[ERROR] TypeError: Cannot read properties of null"],
    fileSnippet: { file: "src/auth.ts", startLine: 38, content: "function login(user) {\n  const token = user.session.token;\n  return token;\n}" },
    diffMatch: { file: "src/auth.ts", summary: "Changed user parameter handling" },
    maxTokens: 3000,
  };

  it("assembles all sections into a context string", () => {
    const result = assembleContext(baseInput);
    expect(result.context).toContain("TypeError: Cannot read properties of null");
    expect(result.context).toContain("src/auth.ts:42");
    expect(result.context).toContain("function login");
    expect(result.context).toContain("Changed user parameter handling");
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it("respects token budget by truncating lower-priority sections", () => {
    const smallBudget: PromptContextInput = {
      ...baseInput,
      maxTokens: 100, // very small — should truncate
    };
    const result = assembleContext(smallBudget);
    // Error is highest priority — always included
    expect(result.context).toContain("TypeError");
    // Token estimate should be within budget
    expect(result.token_estimate).toBeLessThanOrEqual(150); // some slack for formatting
  });

  it("handles missing optional fields gracefully", () => {
    const minimal: PromptContextInput = {
      error: { message: "SyntaxError: unexpected token" },
      surroundingLogs: [],
      fileSnippet: null,
      diffMatch: null,
      maxTokens: 3000,
    };
    const result = assembleContext(minimal);
    expect(result.context).toContain("SyntaxError");
    expect(result.sources).toContain("error");
  });

  it("includes suggested investigation when diff match exists", () => {
    const result = assembleContext(baseInput);
    expect(result.context).toContain("Investigate");
  });
});
