/**
 * Structured test count extraction from test runner summary strings.
 *
 * Parses the `test_summary` string produced by test runner parsers (pytest, vitest,
 * jest, cargo test) into a structured object with pass/fail/skip/warning counts.
 * Used by run_and_watch to provide `test_counts` alongside the existing string field.
 *
 * @see src/parsers/test/ for the parsers that produce summary strings
 * @see .kiro/specs/m26-intelligent-feedback/requirements.md Feature 4
 */

/** Structured test result counts extracted from runner summary output. */
export interface TestCounts {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly warnings: number;
  readonly total: number;
}

/**
 * Extract structured test counts from a test runner summary string.
 *
 * Handles pytest, vitest, jest, and cargo test summary formats.
 * Returns null if the string doesn't match any known format.
 *
 * @param summary - The test_summary string from run_and_watch (e.g., "pytest: 554 passed, 11 warnings in 8.98s")
 * @returns Structured counts or null if not parseable
 */
export function extractTestCounts(summary: string): TestCounts | null {
  if (!summary) return null;

  // pytest: "pytest: 2 failed, 15 passed, 3 skipped, 1 warning in 3.45s"
  if (summary.startsWith("pytest:")) {
    const body = summary.slice(7).trim();
    const passed = extractNum(body, /(\d+)\s+passed/);
    const failed = extractNum(body, /(\d+)\s+(?:failed|error)/);
    const skipped = extractNum(body, /(\d+)\s+skipped/);
    const warnings = extractNum(body, /(\d+)\s+warning/);
    const total = passed + failed + skipped;
    if (total === 0 && warnings === 0) return null;
    return { passed, failed, skipped, warnings, total };
  }

  // vitest: "vitest: 9 tests passed" or "vitest: 3 test file(s) failed"
  if (summary.startsWith("vitest:")) {
    const body = summary.slice(7).trim();
    const passMatch = body.match(/(\d+)\s+tests?\s+passed/);
    const failMatch = body.match(/(\d+)\s+test\s+file\(s\)\s+failed/);
    if (passMatch) {
      const passed = parseInt(passMatch[1], 10);
      return { passed, failed: 0, skipped: 0, warnings: 0, total: passed };
    }
    if (failMatch) {
      const failed = parseInt(failMatch[1], 10);
      return { passed: 0, failed, skipped: 0, warnings: 0, total: failed };
    }
    return null;
  }

  // jest: "jest: Tests: 45 passed, 2 failed, 47 total" or "jest: Tests: 10 passed, 1 failed, 3 skipped, 14 total"
  if (summary.startsWith("jest:")) {
    const body = summary.slice(5).trim();
    const passed = extractNum(body, /(\d+)\s+passed/);
    const failed = extractNum(body, /(\d+)\s+failed/);
    const skipped = extractNum(body, /(\d+)\s+skipped/);
    const totalMatch = body.match(/(\d+)\s+total/);
    const total = totalMatch ? parseInt(totalMatch[1], 10) : passed + failed + skipped;
    if (total === 0) return null;
    return { passed, failed, skipped, warnings: 0, total };
  }

  // cargo test: "cargo test: test result: ok. 42 passed; 0 failed; 1 ignored"
  if (summary.startsWith("cargo test:")) {
    const body = summary.slice(11).trim();
    const passed = extractNum(body, /(\d+)\s+passed/);
    const failed = extractNum(body, /(\d+)\s+failed/);
    const skipped = extractNum(body, /(\d+)\s+ignored/);
    const total = passed + failed + skipped;
    if (total === 0) return null;
    return { passed, failed, skipped, warnings: 0, total };
  }

  return null;
}

/**
 * Extract a number from a string using a regex with one capture group.
 * Returns 0 if no match found.
 */
function extractNum(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  return match ? parseInt(match[1], 10) : 0;
}
