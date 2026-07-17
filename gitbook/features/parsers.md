# 25 Error Parsers

TracePulse parses errors from 25 sources. Parsers run in priority order - first match wins.

## Runtime Parsers

| Parser | Detects | Example |
|--------|---------|---------|
| **JSON structured logs** | pino, structlog JSON, logback, bunyan | `{"level":"error","msg":"connection failed"}` |
| **Structlog key-value** | Python structlog ConsoleRenderer | `[error] connection failed host=db port=5432` |
| **HTTP access log** | uvicorn, express/morgan, nginx | `GET /api/users 500 1234ms` |
| **Node.js** | TypeError, ReferenceError + V8 stack traces | `TypeError: Cannot read property 'id' of undefined` |
| **Python** | Tracebacks with file:line extraction | `File "users.py", line 42, in get_user` |
| **Go** | Panics with goroutine stack traces | `panic: runtime error: index out of range` |
| **Java** | Exceptions with `at` frames + `Caused by:` | `java.lang.NullPointerException` |
| **Rust** | Panics with `RUST_BACKTRACE` output | `thread 'main' panicked at 'index out of bounds'` |
| **Pydantic** | FastAPI ValidationError, field required, type errors | `ValidationError: 2 validation errors for UserCreate` |

## Build Parsers

| Parser | Detects | Example |
|--------|---------|---------|
| **TypeScript** | `tsc` compiler errors (TS####) | `src/auth.ts(42,5): error TS2345: ...` |
| **ESLint** | Lint errors with rule names | `10:5  error  Unexpected any  @typescript-eslint/no-explicit-any` |
| **Vite/webpack** | Build tool errors | `[vite] Internal server error: Failed to resolve import` |
| **Build stats** | Module count, build time | `910 modules transformed`, `built in 1.06s` |

## Test Parsers

| Parser | Detects | Example |
|--------|---------|---------|
| **pytest** | FAILED, ERROR, summary | `FAILED tests/test_auth.py::test_login - AssertionError` |
| **Jest** | FAIL header, x lines, Expected/Received | `FAIL src/auth.test.ts` |
| **vitest** | FAIL file, assertion errors | `FAIL tests/unit/auth.test.ts` |
| **Go test** | `--- FAIL`, error with file:line | `--- FAIL: TestLogin (0.00s)` |
| **cargo test** | test FAILED, panic with file:line, summary | `test result: FAILED. 10 passed; 2 failed` |
| **JUnit/Maven/Gradle** | Surefire summary, Gradle task FAILED, AssertionError | `Tests run: 25, Failures: 2, Errors: 1` |

## Infrastructure Parsers

| Parser | Detects | Example |
|--------|---------|---------|
| **Migration** | alembic + Django migration output | `Running upgrade abc123 -> def456` |
| **npm audit** | Vulnerability summary | `6 vulnerabilities (2 critical, 1 high)` |
| **Coverage** | Istanbul/pytest-cov percentages | `Statements: 85.23%`, `TOTAL 1234 567 54%` |

## Background Worker Parsers

| Parser | Detects | Example |
|--------|---------|---------|
| **Celery** | Task raised/retry/timeout/succeeded | `Task myapp.tasks.send_email[abc-123] raised ValueError` |
| **Sidekiq** | WARN/ERROR/FATAL job events, done timing | `WARN: MyWorker JID-abc123 Error: connection refused` |
| **BullMQ** | Job failed/stalled/completed, queue errors | `[email] Job 42 failed with Error: SMTP timeout` |

## Unmatched Lines

Lines that don't match any parser are stored as raw info-level events with `signal_score: 5`. They're still searchable via `get_server_logs(message_contains: "...")`.
