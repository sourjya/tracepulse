# Build & Test Parser Samples - Real-World Error Output

Research document collecting real-world error output samples from Stack Overflow, GitHub issues, and official documentation for TracePulse build/test parsers.

**Date:** 2026-05-01
**Purpose:** Provide exact terminal output samples for parser development and test fixtures.

---

## 1. TypeScript (`tsc` compiler errors)

### Sample 1: TS2307 - Cannot find module

**Source:** https://stackoverflow.com/questions/42036992/tsc-throws-ts2307-cannot-find-module-for-a-local-file

```
app/index.ts(1,21): error TS2307: Cannot find module 'components/counter'.
```

**Parser should extract:**
- level: `error`
- error_type: `TS2307`
- file: `app/index.ts`
- line: `1`
- column: `21`
- message: `Cannot find module 'components/counter'.`

### Sample 2: TS2345 - Argument type mismatch

**Source:** https://stackoverflow.com/questions/42421501/error-ts2345-argument-of-type-t-is-not-assignable-to-parameter-of-type-objec

```
error TS2345: Argument of type 'T' is not assignable to parameter of type 'object'.
```

**Parser should extract:**
- level: `error`
- error_type: `TS2345`
- message: `Argument of type 'T' is not assignable to parameter of type 'object'.`

### Sample 3: TS2345 - Buffer not assignable to string

**Source:** https://stackoverflow.com/questions/46190511/typescript-error-ts2345-error-ts2345argument-of-type-buffer-is-not-assignabl

```
error TS2345: Argument of type 'Buffer' is not assignable to parameter of type 'string'.
```

**Parser should extract:**
- level: `error`
- error_type: `TS2345`
- message: `Argument of type 'Buffer' is not assignable to parameter of type 'string'.`

### Sample 4: TS2307 with file:line:col format

**Source:** https://stackoverflow.com/questions/67918575/ts2307-cannot-find-module-or-its-corresponding-type-declarations

```
TS2307: Cannot find module 'my-parser-generator' or its corresponding type declarations.
```

**Parser should extract:**
- level: `error`
- error_type: `TS2307`
- message: `Cannot find module 'my-parser-generator' or its corresponding type declarations.`

---

## 2. ESLint (lint errors with rule names)

### Sample 1: Stylish formatter (default)

**Source:** https://archive.eslint.org/docs/4.0.0/user-guide/formatters/ (Official ESLint docs)

```
/var/lib/jenkins/workspace/Releases/ESLint Release/eslint/fullOfProblems.js
  1:10  error    'addOne' is defined but never used            no-unused-vars
  2:9   error    Use the isNaN function to compare with NaN    use-isnan
  3:16  error    Unexpected space before unary operator '++'   space-unary-ops
  3:20  warning  Missing semicolon                             semi
  4:12  warning  Unnecessary 'else' after 'return'             no-else-return
  5:1   warning  Expected indentation of 8 spaces but found 6  indent
  5:7   error    Function 'addOne' expected a return value     consistent-return
  5:13  warning  Missing semicolon                             semi
  7:2   error    Unnecessary semicolon                         no-extra-semi

✖ 9 problems (5 errors, 4 warnings)
  2 errors, 4 warnings potentially fixable with the `--fix` option.
```

**Parser should extract (per line):**
- level: `error` or `warning`
- file: `/var/lib/jenkins/workspace/Releases/ESLint Release/eslint/fullOfProblems.js`
- line: `1`, column: `10`
- error_type: `no-unused-vars` (rule name)
- message: `'addOne' is defined but never used`

### Sample 2: Compact formatter

**Source:** https://archive.eslint.org/docs/4.0.0/user-guide/formatters/ (Official ESLint docs)

```
/var/lib/jenkins/workspace/Releases/ESLint Release/eslint/fullOfProblems.js: line 1, col 10, Error - 'addOne' is defined but never used. (no-unused-vars)
/var/lib/jenkins/workspace/Releases/ESLint Release/eslint/fullOfProblems.js: line 2, col 9, Error - Use the isNaN function to compare with NaN. (use-isnan)
/var/lib/jenkins/workspace/Releases/ESLint Release/eslint/fullOfProblems.js: line 3, col 16, Error - Unexpected space before unary operator '++'. (space-unary-ops)
/var/lib/jenkins/workspace/Releases/ESLint Release/eslint/fullOfProblems.js: line 3, col 20, Warning - Missing semicolon. (semi)

9 problems
```

**Parser should extract (per line):**
- level: `Error` or `Warning`
- file: path before `: line`
- line: number after `line `
- column: number after `col `
- error_type: rule name in parentheses, e.g. `no-unused-vars`
- message: text between `- ` and ` (`

### Sample 3: Unix formatter

**Source:** https://archive.eslint.org/docs/4.0.0/user-guide/formatters/ (Official ESLint docs)

```
/var/lib/jenkins/workspace/Releases/ESLint Release/eslint/fullOfProblems.js:1:10: 'addOne' is defined but never used. [Error/no-unused-vars]
/var/lib/jenkins/workspace/Releases/ESLint Release/eslint/fullOfProblems.js:2:9: Use the isNaN function to compare with NaN. [Error/use-isnan]
/var/lib/jenkins/workspace/Releases/ESLint Release/eslint/fullOfProblems.js:3:16: Unexpected space before unary operator '++'. [Error/space-unary-ops]
/var/lib/jenkins/workspace/Releases/ESLint Release/eslint/fullOfProblems.js:3:20: Missing semicolon. [Warning/semi]
```

**Parser should extract (per line):**
- file: path before first `:`
- line: `1`, column: `10`
- level: `Error` or `Warning` (from bracket)
- error_type: `no-unused-vars` (from bracket)
- message: text between `: ` and ` [`

---

## 3. Vite/webpack (build errors)

### Sample 1: Vite rollup failed to resolve import

**Source:** https://stackoverflow.com/questions/67696920/vite-rollup-failed-to-resolve-build-error

```
> vite-project@0.0.0 build
> vite build

vite v2.3.4 building for production...
✓ 1 modules transformed.
[vite]: Rollup failed to resolve import "style.css" from "index.html".
This is most likely unintended because it can break your application at runtime.
If you do want to externalize this module explicitly add it to
`build.rollupOptions.external`
error during build:
Error: [vite]: Rollup failed to resolve import "style.css" from "index.html".
    at onRollupWarning (/Users/jmansfield/Sites/vite-project/node_modules/vite/dist/node/chunks/dep-6b5f3ba8.js:45022:19)
    at Object.onwarn (/Users/jmansfield/Sites/vite-project/node_modules/vite/dist/node/chunks/dep-6b5f3ba8.js:44812:13)
    at Object.onwarn (/Users/jmansfield/Sites/vite-project/node_modules/rollup/dist/shared/rollup.js:20122:20)
    at ModuleLoader.handleResolveId (/Users/jmansfield/Sites/vite-project/node_modules/rollup/dist/shared/rollup.js:19143:26)
```

**Parser should extract:**
- level: `error`
- error_type: `RollupError` / `resolve-import`
- message: `Rollup failed to resolve import "style.css" from "index.html".`
- file: `index.html` (source file)

### Sample 2: Vite rollup failed to resolve component import

**Source:** https://stackoverflow.com/questions/67696920/vite-rollup-failed-to-resolve-build-error (answer)

```
[vite]: Rollup failed to resolve import "element-plus/es/components/form-input/style/css" from "/app/src/components/MyView.vue?vue&type=script&setup=true&lang.ts".
This is most likely unintended because it can break your application at runtime.
If you do want to externalize this module explicitly add it to
`build.rollupOptions.external`
```

**Parser should extract:**
- level: `error`
- error_type: `RollupError` / `resolve-import`
- message: `Rollup failed to resolve import "element-plus/es/components/form-input/style/css"`
- file: `/app/src/components/MyView.vue`

### Sample 3: webpack Module not found

**Source:** Common webpack error pattern (documented in webpack official docs)

```
ERROR in ./src/index.js
Module not found: Error: Can't resolve './components/App' in '/Users/dev/project/src'
 @ ./src/index.js 1:0-35
```

**Parser should extract:**
- level: `error`
- error_type: `ModuleNotFoundError`
- file: `./src/index.js`
- message: `Can't resolve './components/App' in '/Users/dev/project/src'`

---

## 4. Build Stats

### Sample 1: Vite modules transformed (success)

**Source:** https://stackoverflow.com/questions/67696920/vite-rollup-failed-to-resolve-build-error

```
vite v2.3.4 building for production...
✓ 1 modules transformed.
```

**Parser should extract:**
- level: `info`
- error_type: `build-stats`
- message: `1 modules transformed`

### Sample 2: Vite modules transformed (larger build)

**Source:** https://stackoverflow.com/questions/75717538/how-to-deal-with-vite-browser-external-errors-debuglog-is-not-exported-by

```
403 modules transformed.
```

**Parser should extract:**
- level: `info`
- error_type: `build-stats`
- message: `403 modules transformed`
- module_count: `403`

### Sample 3: webpack compiled successfully

**Source:** Common webpack dev server output pattern

```
webpack 5.75.0 compiled successfully in 1234 ms
```

```
webpack 5.75.0 compiled with 2 warnings in 3456 ms
```

```
webpack 5.75.0 compiled with 1 error and 3 warnings in 5678 ms
```

**Parser should extract:**
- level: `info` (success), `warn` (warnings only), `error` (has errors)
- error_type: `build-stats`
- message: full line
- build_time: `1234` ms
- error_count: `0` / `1`
- warning_count: `0` / `2` / `3`

---

## 5. pytest (FAILED, ERROR, summary lines)

### Sample 1: Full pytest failure output

**Source:** https://stackoverflow.com/questions/30994622/pytest-report-summary-to-display-error-information

```
========================= test session starts =================================
platform darwin -- Python 2.7.5 -- py-1.4.26 -- pytest-2.7.0 -- /Users/nehau/src/QA/bin/python
rootdir: /Users/nehau/src/QA/test, inifile:
plugins: capturelog
collected 2 items

test_foocompare.py::test_compare12 FAILED
test_foocompare.py::test_compare34 FAILED

================================ FAILURES ===============================
_______________________________ test_compare12 _________________________

def test_compare12():
    f1 = Foo(1)
    f2 = Foo(2)
>       assert f1 == f2, "F2 does not match F1"
E       AssertionError: F2 does not match F1
E       assert <test.test_foocompare.Foo instance at 0x107640368> == <test.test_foocompare.Foo instance at 0x107640488>

test_foocompare.py:11: AssertionError
_____________________________ test_compare34______________________________

def test_compare34():
    f3 = Foo(3)
    f4 = Foo(4)
>       assert f3 == f4, "F4 does not match F3"
E       AssertionError: F4 does not match F3
E       assert <test.test_foocompare.Foo instance at 0x107640248> == <test.test_foocompare.Foo instance at 0x10761fe60>

test_foocompare.py:16: AssertionError

=============================== 2 failed in 0.01 seconds ==========================
```

**Parser should extract:**

Per test line:
- level: `error`
- error_type: `test-failure`
- file: `test_foocompare.py`
- line: `11` (from `test_foocompare.py:11: AssertionError`)
- test_name: `test_compare12`
- message: `AssertionError: F2 does not match F1`

Summary line:
- level: `error`
- error_type: `test-summary`
- passed: `0`, failed: `2`
- message: `2 failed in 0.01 seconds`

### Sample 2: pytest short test summary info

**Source:** https://stackoverflow.com/questions/71126638/how-to-override-a-long-file-path-in-pytest-summary-report

```
=========================== short test summary info ============================
FAILED tests/test_something.py::test_something
FAILED tests/test_other.py::test_other_thing
========================= 2 failed, 5 passed in 1.23s =========================
```

**Parser should extract (per FAILED line):**
- level: `error`
- error_type: `test-failure`
- file: `tests/test_something.py`
- test_name: `test_something`

Summary:
- failed: `2`, passed: `5`

### Sample 3: pytest with errors (collection errors)

**Source:** https://stackoverflow.com/questions/79769889/control-the-ordering-of-pytest-terminal-summary-sections

```
1 failed, 3 passed, 6 errors in 0.45s
```

**Parser should extract:**
- level: `error`
- error_type: `test-summary`
- failed: `1`, passed: `3`, errors: `6`

---

## 6. Jest (FAIL header, assertion details)

### Sample 1: Jest FAIL with toHaveLength assertion

**Source:** https://stackoverflow.com/questions/59943855/getting-failed-status-while-running-jest-test

```
 ● Login component tests › should have 3 input fields!

expect(received).toHaveLength(expected)

Expected length: 3
Received length: 0
Received object: {}

  13 |
  14 |         it('should have 3 input fields!', ()=> {
> 15 |             expect(wrapper.find('input')).toHaveLength(3);
     |                                           ^
  16 |         });
  17 |
  18 |

  at Object.it (src/components/auth/Login.test.js:15:43)

Test Suites: 1 failed, 1 total
```

**Parser should extract:**
- level: `error`
- error_type: `test-failure`
- file: `src/components/auth/Login.test.js`
- line: `15`
- column: `43`
- test_name: `Login component tests > should have 3 input fields!`
- message: `expect(received).toHaveLength(expected) - Expected length: 3, Received length: 0`

### Sample 2: Jest toEqual deep equality

**Source:** https://stackoverflow.com/questions/75043375/expectreceived-toequalexpected-deep-equality-error-jest-unit-testing

```
expect(received).toEqual(expected) // deep equality

Expected: {"id": 1, "name": "Test"}
Received: {"id": 1, "name": "Wrong"}
```

**Parser should extract:**
- level: `error`
- error_type: `test-failure`
- message: `expect(received).toEqual(expected) // deep equality`

### Sample 3: Jest Test Suites summary

**Source:** Common Jest output pattern

```
Test Suites: 1 failed, 2 passed, 3 total
Tests:       2 failed, 8 passed, 10 total
Snapshots:   0 total
Time:        3.456 s
```

**Parser should extract:**
- level: `error` (if any failed)
- error_type: `test-summary`
- suites_failed: `1`, suites_passed: `2`
- tests_failed: `2`, tests_passed: `8`

---

## 7. vitest (FAIL file, Expected/Received)

### Sample 1: vitest assertion failure (from official docs)

**Source:** https://vitest.dev/guide/learn/debugging-tests (Official Vitest documentation)

```
 FAIL src/user.test.js > createUser > sets the default role
AssertionError: expected { name: 'Alice', role: 'viewer' } to deeply equal { name: 'Alice', role: 'member' }

- Expected
+ Received

  {
    "name": "Alice",
-   "role": "member",
+   "role": "viewer",
  }

 ❯ src/user.test.js:8:22
      6|   test('sets the default role', () => {
      7|     const user = createUser('Alice')
      8|     expect(user).toEqual({ name: 'Alice', role: 'member' })
                          ^
      9|   })
     10| })
```

**Parser should extract:**
- level: `error`
- error_type: `test-failure` / `AssertionError`
- file: `src/user.test.js`
- line: `8`
- column: `22`
- test_name: `createUser > sets the default role`
- message: `expected { name: 'Alice', role: 'viewer' } to deeply equal { name: 'Alice', role: 'member' }`

### Sample 2: vitest truncated toEqual output

**Source:** https://github.com/vitest-dev/vitest/issues/2448

```
AssertionError: expected { hello: 'world', …(3) } to deeply equal { hello: 'world', …(2) }
```

**Parser should extract:**
- level: `error`
- error_type: `AssertionError`
- message: `expected { hello: 'world', …(3) } to deeply equal { hello: 'world', …(2) }`

### Sample 3: vitest style assertion (from GitHub issue)

**Source:** https://github.com/vitest-dev/vitest/issues/1239

```
- Expected   "color: orange;"
+ Received   "color: red;"
```

**Parser should extract:**
- level: `error`
- error_type: `test-failure`
- expected: `color: orange;`
- received: `color: red;`

---

## 8. Go test (`--- FAIL`, error with file:line)

### Sample 1: Go test verbose failure

**Source:** https://stackoverflow.com/questions/44321118/finding-file-name-of-test-that-failed-using-go-test-golang

```
=== RUN   TestReturn
--- FAIL: TestReturn (0.00s)
    ex_test.go:10: /home/user/go/src/example
    ex_test.go:11: Expected 42, got 43
FAIL
exit status 1
FAIL	example	0.002s
```

**Parser should extract:**
- level: `error`
- error_type: `test-failure`
- test_name: `TestReturn`
- file: `ex_test.go`
- line: `11`
- message: `Expected 42, got 43`
- duration: `0.00s`

### Sample 2: Go test with t.Error

**Source:** https://stackoverflow.com/questions/23205419/how-do-you-print-in-a-go-test-using-the-testing-package

```
--- FAIL: TestPrintSomethingAgain (0.00s)
    main_test.go:14: Say hi
FAIL
exit status 1
FAIL	command-line-arguments	0.004s
```

**Parser should extract:**
- level: `error`
- error_type: `test-failure`
- test_name: `TestPrintSomethingAgain`
- file: `main_test.go`
- line: `14`
- message: `Say hi`

### Sample 3: Go test package-level FAIL

**Source:** https://stackoverflow.com/questions/44321118/finding-file-name-of-test-that-failed-using-go-test-golang

```
--- FAIL: TestFillDeepStruct (0.00s)
FAIL
exit status 1
FAIL	example	0.002s
```

**Parser should extract:**
- level: `error`
- error_type: `test-failure`
- test_name: `TestFillDeepStruct`
- package: `example`

---

## 9. cargo test (test FAILED, panic with file:line)

### Sample 1: Rust assertion failure with left/right

**Source:** https://stackoverflow.com/questions/61603982/thread-main-panicked-at-assertion-failed-left-right-left-22-right

```
thread 'main' panicked at 'assertion failed: `(left == right)`
  left: `22`,
  right: `4`', src/main.rs:15:5
```

**Parser should extract:**
- level: `error`
- error_type: `panic` / `assertion-failure`
- file: `src/main.rs`
- line: `15`
- column: `5`
- message: `assertion failed: (left == right) - left: 22, right: 4`

### Sample 2: cargo test with test result summary

**Source:** https://docs.rs/testresult/ (testresult crate documentation)

```
---- tests::it_works stdout ----
thread 'tests::it_works' panicked at 'assertion failed: `(left == right)`
  left: `1`,
  right: `0`', src/lib.rs:52:5
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out
```

**Parser should extract:**

Panic line:
- level: `error`
- error_type: `panic`
- file: `src/lib.rs`
- line: `52`
- test_name: `tests::it_works`
- message: `assertion failed: (left == right) - left: 1, right: 0`

Summary line:
- level: `error`
- error_type: `test-summary`
- passed: `0`, failed: `1`, ignored: `0`

### Sample 3: cargo test panicked at Box<Any>

**Source:** https://stackoverflow.com/questions/56027354/why-does-a-test-fail-with-the-message-panicked-at-boxany

```
---- test_testbool stdout ----
thread 'test_testbool' panicked at 'Box<Any>', src/lib.rs:11:5
note: Run with `RUST_BACKTRACE=1` environment variable to display a backtrace.

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

error: test failed, to rerun pass '--lib'
```

**Parser should extract:**
- level: `error`
- error_type: `panic`
- file: `src/lib.rs`
- line: `11`
- test_name: `test_testbool`
- message: `Box<Any>`

---

## 10. JUnit/Maven/Gradle (Surefire summary, Gradle task FAILED)

### Sample 1: Maven Surefire BUILD FAILURE

**Source:** https://stackoverflow.com/questions/37044557/maven-surefire-plugin-error

```
[INFO] ------------------------------------------------------------------------
[INFO] Reactor Summary:
[INFO]
[INFO] Jenkins main module................................ SUCCESS [ 11.809 s]
[INFO] Jenkins cli........................................ SUCCESS [ 38.319 s]
[INFO] Jenkins core....................................... FAILURE [11:15 min]
[INFO] Jenkins war........................................ SKIPPED
[INFO] Tests for Jenkins core............................. SKIPPED
[INFO] ------------------------------------------------------------------------
[INFO] BUILD FAILURE
[INFO] ------------------------------------------------------------------------
[INFO] Total time: 12:10 min
[INFO] Finished at: 2016-05-05T12:26:54+05:30
[INFO] Final Memory: 39M/277M
[INFO] ------------------------------------------------------------------------
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:2.19.1:test (default-test) on project jenkins-core:
[ERROR]
[ERROR] Please refer to C:\Users\Anishas\git\jenkins\core\target\surefire-reports for the individual test results.
[ERROR] -> [Help 1]
```

**Parser should extract:**
- level: `error`
- error_type: `build-failure` / `surefire-failure`
- message: `Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:2.19.1:test (default-test) on project jenkins-core`
- project: `jenkins-core`

### Sample 2: Maven Surefire test results summary

**Source:** https://stackoverflow.com/questions/27378529/maven-surefire-test-failures-on-clean-install (common Surefire output pattern)

```
Tests run: 12, Failures: 2, Errors: 1, Skipped: 0

[ERROR] There are test failures.

[ERROR] Please refer to /home/stanbol-trunk/entityhub/ldpath/target/surefire-reports for the individual test results.
```

**Parser should extract:**
- level: `error`
- error_type: `test-summary`
- tests_run: `12`, failures: `2`, errors: `1`, skipped: `0`
- message: `There are test failures.`

### Sample 3: Gradle task FAILED

**Source:** Common Gradle output pattern (documented in Gradle docs)

```
> Task :app:test FAILED

com.example.MyTest > testAddition FAILED
    java.lang.AssertionError: expected:<4> but was:<5>
        at org.junit.Assert.fail(Assert.java:88)
        at org.junit.Assert.failNotEquals(Assert.java:834)
        at org.junit.Assert.assertEquals(Assert.java:645)
        at com.example.MyTest.testAddition(MyTest.java:15)

3 tests completed, 1 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:test'.
> There were failing tests. See the report at: file:///build/reports/tests/test/index.html

BUILD FAILED in 5s
```

**Parser should extract:**

Task line:
- level: `error`
- error_type: `task-failure`
- task: `:app:test`

Test failure:
- level: `error`
- error_type: `test-failure`
- test_name: `com.example.MyTest > testAddition`
- file: `MyTest.java`
- line: `15`
- message: `expected:<4> but was:<5>`

Summary:
- tests_completed: `3`, tests_failed: `1`

---

## Parser Pattern Summary

| Parser | Key Patterns | File:Line Format |
|--------|-------------|------------------|
| TypeScript | `error TS####:` | `file(line,col): error TS####:` |
| ESLint (stylish) | `line:col  error/warning  message  rule-name` | `  1:10  error  ...  no-unused-vars` |
| ESLint (compact) | `file: line N, col N, Error -` | `file: line 1, col 10, Error - msg (rule)` |
| Vite | `[vite]: Rollup failed to resolve` | `from "file"` in message |
| webpack | `Module not found: Error:` | `ERROR in ./file` |
| Build stats (Vite) | `✓ N modules transformed` | N/A |
| Build stats (webpack) | `compiled successfully in N ms` | N/A |
| pytest | `FAILED`, `E  AssertionError:` | `file.py:line: AssertionError` |
| Jest | `● describe › test`, `Expected/Received` | `at Object.it (file:line:col)` |
| vitest | `FAIL file > describe > test`, `AssertionError:` | `❯ file:line:col` |
| Go test | `--- FAIL: TestName (duration)` | `file_test.go:line: message` |
| cargo test | `thread 'name' panicked at` | `file.rs:line:col` |
| Maven Surefire | `Tests run: N, Failures: N` | N/A (see surefire-reports) |
| Gradle | `> Task :path FAILED`, `BUILD FAILED` | `(File.java:line)` in stack trace |
