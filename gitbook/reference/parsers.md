# Parsers Reference

TracePulse includes 25 error parsers that extract structured data from raw log lines. Parsers run in priority order on every line - the first match wins. If no parser matches, the line is stored as a raw info event.

## How parsers work

Each parser:
1. **Matches** - checks if the line looks like its error format (regex or pattern match)
2. **Extracts** - pulls out file path, line number, error type, message, and stack trace
3. **Classifies** - sets the severity level (`error`, `warn`, `info`)
4. **Returns** a structured event that gets scored and stored

Parsers are tried in priority order. Specific parsers (like TypeScript `TS####` errors) run before generic ones (like Node.js `Error:` patterns) to avoid misclassification.

---

## Runtime Parsers

These catch errors from running application code.

### Node.js

Matches V8 error patterns: `TypeError`, `ReferenceError`, `SyntaxError`, `RangeError`, and any `Error:` with a stack trace containing `at` frames.

**Extracts:** error type, message, file, line, column from the first user-code stack frame (skips `node_modules`).

```
TypeError: Cannot read properties of null (reading 'id')
    at getUser (/app/src/routes/users.ts:42:15)
    at Layer.handle [as handle_request] (node_modules/express/lib/router/layer.js:95:5)
```

### Python

Matches Python tracebacks starting with `Traceback (most recent call last):` and `File "...", line N` patterns.

**Extracts:** error type, message, file, line from the deepest frame. Handles multi-line tracebacks and chained exceptions (`During handling of the above exception`).

```
Traceback (most recent call last):
  File "app/routes/users.py", line 42, in get_user
    return user["name"]
TypeError: 'NoneType' object is not subscriptable
```

### Pydantic

Matches FastAPI/Pydantic `ValidationError` patterns with field-level detail.

**Extracts:** error count, model name, field names, validation error types.

```
pydantic_core._pydantic_core.ValidationError: 2 validation errors for UserCreate
  email
    value is not a valid email address [type=value_error]
```

### Go

Matches Go panic patterns (`panic:`, `goroutine N [running]:`) and `runtime error:` messages.

**Extracts:** panic message, file, line from goroutine stack frames.

```
panic: runtime error: index out of range [3] with length 2

goroutine 1 [running]:
main.processItems(...)
    /app/main.go:42 +0x1a4
```

### Java

Matches Java exception patterns with `at` stack frames and `Caused by:` chains. Covers Spring Boot, Maven, and Gradle output.

**Extracts:** exception class, message, file, line. Follows `Caused by:` chains to find the root cause.

```
java.lang.NullPointerException: Cannot invoke method on null
    at com.app.UserService.getUser(UserService.java:42)
    at com.app.UserController.show(UserController.java:18)
Caused by: java.sql.SQLException: Connection refused
```

### Rust

Matches Rust panic output with `thread 'name' panicked at` and `RUST_BACKTRACE` stack frames.

**Extracts:** panic message, file, line from backtrace frames.

```
thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 5', src/main.rs:42:10
```

### JSON structured logs

Matches JSON objects with `level`/`msg` or `severity`/`message` fields. Covers pino, structlog JSON mode, logback JSON, and bunyan.

**Extracts:** level, message, error type, stack trace, and any `file`/`line` fields present in the JSON.

```json
{"level":"error","msg":"connection failed","err":"ECONNREFUSED","host":"localhost","port":5432}
```

### Structlog key-value

Matches Python structlog ConsoleRenderer output with bracket-delimited levels: `[info]`, `[warning]`, `[error]`.

**Extracts:** level, message, key-value context pairs.

```
2026-05-03 12:00:00 [error] connection failed host=db port=5432 retry=3
```

### HTTP access log

Matches common access log formats from uvicorn, express/morgan, nginx, and similar servers.

**Extracts:** HTTP method, path, status code, response time in ms. Status 4xx/5xx are classified as errors.

```
INFO:     127.0.0.1:52340 - "POST /api/users HTTP/1.1" 500 Internal Server Error
```

---

## Build Parsers

These catch compilation and lint errors from build tools.

### TypeScript

Matches `tsc` compiler errors with `TS####` codes and `file(line,col): error` format.

**Extracts:** error code, message, file, line, column.

```
src/utils/calc.ts(18,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

### ESLint

Matches ESLint output with `line:col  error/warning  message  rule-name` format.

**Extracts:** severity, message, rule name, file, line, column.

```
  10:5  error  Unexpected any type  @typescript-eslint/no-explicit-any
```

### Vite/webpack

Matches build tool errors: `[vite] Internal server error`, `Module not found`, transform failures, and HMR errors.

**Extracts:** error message, module path when available.

```
[vite] Internal server error: Failed to resolve import "./missing" from "src/App.tsx"
```

### Build stats

Matches build completion messages with module counts and timing. These are info-level events, not errors.

**Extracts:** module count, build time.

```
910 modules transformed.
dist/index.js   245.67 kB │ gzip: 78.12 kB
built in 1.06s
```

---

## Test Parsers

These catch test failures from all major test runners.

### pytest

Matches `FAILED`, `ERROR`, and summary lines from pytest output.

**Extracts:** test file, test name, error type, assertion details.

```
FAILED tests/test_auth.py::test_login_invalid_password - AssertionError: assert 401 == 200
```

### Jest

Matches `FAIL` headers, `Expected`/`Received` blocks, and summary lines.

**Extracts:** test file, test name, expected vs received values.

```
FAIL src/auth.test.ts
  ● login > should reject invalid password
    expect(received).toBe(expected)
    Expected: 200
    Received: 401
```

### vitest

Matches vitest `FAIL` output with file paths and assertion errors.

**Extracts:** test file, assertion details, expected vs received.

### Go test

Matches `--- FAIL:` lines and error output with `file:line` references.

**Extracts:** test name, file, line, error message.

```
--- FAIL: TestLogin (0.00s)
    auth_test.go:42: expected status 200, got 401
```

### cargo test

Matches Rust test output: `test ... FAILED`, panic messages, and summary lines.

**Extracts:** test name, panic message, file, line, pass/fail counts.

```
test auth::test_login ... FAILED
test result: FAILED. 10 passed; 2 failed; 0 ignored
```

### JUnit/Maven/Gradle

Matches Surefire summary lines, Gradle `> Task :test FAILED`, and `AssertionError` patterns from Java test frameworks.

**Extracts:** pass/fail/error counts, test class, assertion details.

```
Tests run: 25, Failures: 2, Errors: 1, Skipped: 0
```

---

## Infrastructure Parsers

### Migration

Matches alembic (`Running upgrade/downgrade`) and Django (`Applying app.0001_initial`) migration output.

**Extracts:** migration direction, revision IDs, migration name.

### npm audit

Matches `npm audit` vulnerability summaries.

**Extracts:** vulnerability counts by severity.

### Coverage

Matches Istanbul and pytest-cov coverage output with percentage lines.

**Extracts:** statement/branch/function/line coverage percentages.

---

## Background Worker Parsers

### Celery

Matches Celery task lifecycle events: `raised`, `retry`, `timeout`, `succeeded`.

**Extracts:** task name, task ID, error type, timing.

```
Task myapp.tasks.send_email[abc-123] raised ValueError('Invalid recipient')
```

### Sidekiq

Matches Sidekiq `WARN`/`ERROR`/`FATAL` job events and completion timing.

**Extracts:** worker class, job ID, error message, duration.

### BullMQ

Matches BullMQ job lifecycle events: failed, stalled, completed.

**Extracts:** queue name, job ID, error message.

```
[email] Job 42 failed with Error: SMTP connection timeout
```

---

## Unmatched lines

Lines that don't match any parser are stored as raw `info`-level events with `signal_score: 5`. They're still searchable via `get_server_logs(message_contains: "...")` and appear in `get_timeline`.
