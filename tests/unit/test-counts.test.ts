/**
 * Tests for structured test_counts extraction from test runner summary lines.
 *
 * Verifies that run_and_watch returns a test_counts object with
 * passed/failed/skipped/warnings/total fields parsed from test runner output.
 *
 * @see src/tools/test-counts.ts for the extraction logic
 * @see .kiro/specs/m26-intelligent-feedback/requirements.md Feature 4
 */

import { describe, it, expect } from "vitest";
import { extractTestCounts, type TestCounts } from "@/tools/test-counts.js";

describe("extractTestCounts", () => {
  describe("pytest", () => {
    it("parses all-pass summary", () => {
      const result = extractTestCounts("pytest: 554 passed, 11 warnings in 8.98s");
      expect(result).toEqual({ passed: 554, failed: 0, skipped: 0, warnings: 11, total: 554 });
    });

    it("parses mixed summary", () => {
      const result = extractTestCounts("pytest: 2 failed, 15 passed in 3.45s");
      expect(result).toEqual({ passed: 15, failed: 2, skipped: 0, warnings: 0, total: 17 });
    });

    it("parses with skipped", () => {
      const result = extractTestCounts("pytest: 10 passed, 3 skipped, 1 warning in 2.1s");
      expect(result).toEqual({ passed: 10, failed: 0, skipped: 3, warnings: 1, total: 13 });
    });

    it("parses errors", () => {
      const result = extractTestCounts("pytest: 1 error, 5 passed in 1.2s");
      expect(result).toEqual({ passed: 5, failed: 1, skipped: 0, warnings: 0, total: 6 });
    });
  });

  describe("vitest", () => {
    it("parses pass-only summary", () => {
      const result = extractTestCounts("vitest: 9 tests passed");
      expect(result).toEqual({ passed: 9, failed: 0, skipped: 0, warnings: 0, total: 9 });
    });

    it("parses failure summary", () => {
      const result = extractTestCounts("vitest: 3 test file(s) failed");
      expect(result).toEqual({ passed: 0, failed: 3, skipped: 0, warnings: 0, total: 3 });
    });
  });

  describe("jest", () => {
    it("parses jest summary", () => {
      const result = extractTestCounts("jest: Tests: 45 passed, 2 failed, 47 total");
      expect(result).toEqual({ passed: 45, failed: 2, skipped: 0, warnings: 0, total: 47 });
    });

    it("parses jest with skipped", () => {
      const result = extractTestCounts("jest: Tests: 10 passed, 1 failed, 3 skipped, 14 total");
      expect(result).toEqual({ passed: 10, failed: 1, skipped: 3, warnings: 0, total: 14 });
    });
  });

  describe("go test", () => {
    it("parses go test ok line", () => {
      const result = extractTestCounts("go test: ok (12 tests)");
      expect(result).toBeNull(); // go test doesn't have a single summary line we parse yet
    });
  });

  describe("cargo test", () => {
    it("parses cargo test summary", () => {
      const result = extractTestCounts("cargo test: test result: ok. 42 passed; 0 failed; 1 ignored");
      expect(result).toEqual({ passed: 42, failed: 0, skipped: 1, warnings: 0, total: 43 });
    });
  });

  describe("non-matching", () => {
    it("returns null for non-test-summary strings", () => {
      expect(extractTestCounts("some random log line")).toBeNull();
      expect(extractTestCounts("")).toBeNull();
    });
  });
});
