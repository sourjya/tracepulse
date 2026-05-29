---
description: "Run tests and fix failures"
---

# @tp-test

Run the project's test suite and fix any failures.

1. Detect the test command from package.json, pyproject.toml, or Makefile
2. Call `run_and_watch(command, timeout_seconds: 120)` with the detected command
3. If all tests pass: report "All tests passing" with count
4. If failures exist:
   a. For each failed test (up to 5):
      - Read the test file and the source file it tests
      - Identify whether the bug is in the test or the source
      - Fix the code (prefer fixing source over fixing tests unless the test is wrong)
   b. Re-run with `run_and_watch` to verify
5. Never use Shell for test commands. Use `cwd` parameter for monorepos.
