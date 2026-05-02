/**
 * Tests for get_bug_patterns MCP tool handler.
 *
 * @see src/tools/get-bug-patterns.ts for implementation
 */

import { describe, it, expect } from "vitest";
import { handleGetBugPatterns } from "@/tools/get-bug-patterns.js";
import { createPatternAnalyzer } from "@/analysis/pattern-analyzer.js";

describe("handleGetBugPatterns", () => {
  it("returns patterns from analyzer", () => {
    const analyzer = createPatternAnalyzer();
    analyzer.addSession({ session_id: "s1", timestamp: Date.now() - 3e6, fingerprints: ["fp-a"] });
    analyzer.addSession({ session_id: "s2", timestamp: Date.now() - 2e6, fingerprints: ["fp-a"] });
    analyzer.addSession({ session_id: "s3", timestamp: Date.now() - 1e6, fingerprints: ["fp-a"] });

    const result = handleGetBugPatterns(analyzer);
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.patterns.recurring).toHaveLength(1);
    expect(parsed.patterns.recurring[0].fingerprint).toBe("fp-a");
    expect(parsed.summary).toContain("recurring");
  });

  it("returns empty patterns when no sessions", () => {
    const analyzer = createPatternAnalyzer();
    const result = handleGetBugPatterns(analyzer);
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.patterns.recurring).toHaveLength(0);
    expect(parsed.summary).toContain("No patterns");
  });
});
