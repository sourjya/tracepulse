/**
 * Tests for cargo test and JUnit/Maven parsers.
 */

import { describe, it, expect } from "vitest";
import { cargoTestParser } from "@/parsers/test/cargo-test-parser.js";
import { junitParser } from "@/parsers/test/junit-parser.js";

describe("cargoTestParser", () => {
  it("parses test FAILED line", () => {
    const line = "test tests::auth::test_login ... FAILED";
    expect(cargoTestParser.canParse(line)).toBe(true);
    const result = cargoTestParser.parse(line);
    expect(result!.level).toBe("error");
    expect(result!.message).toContain("test_login");
  });

  it("parses panic with file:line", () => {
    const line = "thread 'tests::test_login' panicked at 'assertion failed: left == right', src/auth.rs:42";
    expect(cargoTestParser.canParse(line)).toBe(true);
    const result = cargoTestParser.parse(line);
    expect(result!.level).toBe("error");
    expect(result!.context.file).toBe("src/auth.rs");
    expect(result!.context.line).toBe(42);
  });

  it("parses FAILED summary", () => {
    const line = "test result: FAILED. 10 passed; 2 failed; 0 ignored; 0 measured";
    const result = cargoTestParser.parse(line);
    expect(result!.level).toBe("warn");
    expect(result!.message).toContain("10 passed, 2 failed");
  });

  it("parses ok summary", () => {
    const line = "test result: ok. 15 passed; 0 failed; 0 ignored";
    const result = cargoTestParser.parse(line);
    expect(result!.level).toBe("info");
  });

  it("ignores unrelated lines", () => {
    expect(cargoTestParser.canParse("running 5 tests")).toBe(false);
  });
});

describe("junitParser", () => {
  it("parses Maven Surefire summary with failures", () => {
    const line = "Tests run: 25, Failures: 2, Errors: 1, Skipped: 3";
    expect(junitParser.canParse(line)).toBe(true);
    const result = junitParser.parse(line);
    expect(result!.level).toBe("warn");
    expect(result!.message).toContain("25 run, 2 failures, 1 errors");
  });

  it("parses Maven Surefire summary all passing", () => {
    const line = "Tests run: 25, Failures: 0, Errors: 0, Skipped: 0";
    const result = junitParser.parse(line);
    expect(result!.level).toBe("info");
  });

  it("parses Gradle task FAILED", () => {
    const line = "> Task :app:test FAILED";
    expect(junitParser.canParse(line)).toBe(true);
    const result = junitParser.parse(line);
    expect(result!.level).toBe("error");
    expect(result!.context.framework).toBe("gradle");
  });

  it("parses test class > method FAILED", () => {
    const line = "com.example.AuthTest > testLogin FAILED";
    const result = junitParser.parse(line);
    expect(result!.level).toBe("error");
    expect(result!.message).toContain("AuthTest.testLogin");
  });

  it("parses AssertionError", () => {
    const line = "java.lang.AssertionError: expected:<200> but was:<401>";
    const result = junitParser.parse(line);
    expect(result!.level).toBe("error");
    expect(result!.context.error_type).toBe("AssertionError");
  });

  it("parses BUILD FAILURE", () => {
    const line = "BUILD FAILURE";
    const result = junitParser.parse(line);
    expect(result!.level).toBe("error");
  });

  it("parses BUILD SUCCESS", () => {
    const line = "BUILD SUCCESS";
    const result = junitParser.parse(line);
    expect(result!.level).toBe("info");
  });

  it("ignores unrelated lines", () => {
    expect(junitParser.canParse("Compiling 42 source files")).toBe(false);
  });
});
