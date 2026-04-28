# Test Runner

Use TracePulse to monitor test runner output and catch test failures.

## Setup

```bash
# pytest (watch mode)
tracepulse start "pytest --watch"
tracepulse start "ptw -- --tb=short"

# jest (watch mode)
tracepulse start "npx jest --watch"

# or attach to test output log
tracepulse attach --log-file ./test-output.log
```

## Workflow

### After editing code
1. Tests auto-run (watch mode)
2. `get_build_errors()` - check for test failures
3. If failures: read `context.file` and `context.error_type` for the failing test
4. Fix the code
5. `watch_for_errors(10)` - wait for test re-run
6. `get_build_errors()` - verify clean

### Manual test run
1. `clear_errors()` - clean slate
2. Run tests (agent or user triggers)
3. `get_errors(limit: 10)` - see failures sorted by signal score
4. For each failure: `get_error_context(fingerprint)` for assertion details

## What TracePulse Captures

| Test Output | TracePulse Event |
|-------------|-----------------|
| `FAILED tests/test_auth.py::test_login` | error, file=tests/test_auth.py, framework=pytest |
| `FAIL src/auth.test.ts` | error, file=src/auth.test.ts, framework=jest |
| `AssertionError: assert 401 == 200` | error_type=AssertionError |
| `Expected: 200, Received: 401` | error_type=expect.toBe |
| `2 failed, 15 passed` | warn, summary line |
