/**
 * JUnit/Maven/Gradle test output parser for TracePulse.
 *
 * Parses Maven Surefire, Gradle test, and raw JUnit output formats.
 * Covers the most common Java/Kotlin test runner output patterns.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** Tests run: 5, Failures: 1, Errors: 0, Skipped: 0 (Maven Surefire) */
const MAVEN_SUMMARY = /Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)/;

/** > Task :test FAILED (Gradle) */
const GRADLE_FAILED = />\s*Task\s+:(\S*test\S*)\s+FAILED/i;

/** com.example.AuthTest > testLogin FAILED */
const TEST_FAILED = /(\S+)\s+>\s+(\S+)\s+FAILED/;

/** java.lang.AssertionError: expected:<200> but was:<401> */
const ASSERTION_ERROR = /(?:java\.lang\.)?AssertionError:\s*(.+)/;

/** BUILD FAILURE or BUILD SUCCESS (Maven) */
const BUILD_RESULT = /BUILD (SUCCESS|FAILURE)/;

export const junitParser: ErrorParser = {
  name: "junit",

  /** Test for JUnit/Maven/Gradle patterns: Surefire summary, task FAILED, AssertionError, BUILD result. */
  canParse(line: string): boolean {
    return MAVEN_SUMMARY.test(line) || GRADLE_FAILED.test(line) ||
           TEST_FAILED.test(line) || ASSERTION_ERROR.test(line) ||
           BUILD_RESULT.test(line);
  },

  /** Parse JUnit/Maven/Gradle output into structured error with test class, method, and counts. */
  parse(line: string): ParsedError | null {
    const assertMatch = line.match(ASSERTION_ERROR);
    if (assertMatch) {
      return {
        message: `AssertionError: ${assertMatch[1]}`,
        level: "error",
        context: { error_type: "AssertionError", framework: "junit" },
        scoring_hints: { is_user_code: true },
      };
    }

    const testMatch = line.match(TEST_FAILED);
    if (testMatch) {
      return {
        message: `Test failed: ${testMatch[1]}.${testMatch[2]}`,
        level: "error",
        context: { framework: "junit" },
        scoring_hints: { is_user_code: true },
      };
    }

    const gradleMatch = line.match(GRADLE_FAILED);
    if (gradleMatch) {
      return {
        message: `Gradle task failed: ${gradleMatch[1]}`,
        level: "error",
        context: { framework: "gradle" },
        scoring_hints: {},
      };
    }

    const mavenMatch = line.match(MAVEN_SUMMARY);
    if (mavenMatch) {
      const failures = parseInt(mavenMatch[2], 10);
      const errors = parseInt(mavenMatch[3], 10);
      const hasFailed = failures > 0 || errors > 0;
      return {
        message: `junit: ${mavenMatch[1]} run, ${mavenMatch[2]} failures, ${mavenMatch[3]} errors`,
        level: hasFailed ? "warn" : "info",
        context: { framework: "junit" },
        scoring_hints: {},
      };
    }

    const buildMatch = line.match(BUILD_RESULT);
    if (buildMatch) {
      return {
        message: `Maven: BUILD ${buildMatch[1]}`,
        level: buildMatch[1] === "FAILURE" ? "error" : "info",
        context: { framework: "maven" },
        scoring_hints: {},
      };
    }

    return null;
  },
};
