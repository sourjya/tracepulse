# Run Tests Through TracePulse

Use `run_and_watch` to execute tests and get parsed, structured results.

## pytest

```
run_and_watch(command: "pytest tests/", timeout_seconds: 60)
```

Response:
```json
{
  "exit_code": 1,
  "success": false,
  "error_count": 2,
  "errors": [
    { "message": "test_login - AssertionError: assert 401 == 200", "context": { "file": "tests/test_auth.py", "framework": "pytest" } },
    { "message": "test_export - ImportError: cannot import name 'export'", "context": { "file": "tests/test_export.py", "framework": "pytest" } }
  ],
  "summary": "Command failed (exit 1) in 3450ms, 2 errors"
}
```

## Jest / vitest

```
run_and_watch(command: "npx vitest run", timeout_seconds: 60)
```

## Go test

```
run_and_watch(command: "go test ./...", timeout_seconds: 60)
```

## Type checking

```
run_and_watch(command: "tsc --noEmit", timeout_seconds: 30)
```

## Linting

```
run_and_watch(command: "npx eslint src/", timeout_seconds: 30)
```

## How it works

1. TracePulse spawns the command as a child process
2. stdout/stderr are piped through all 26 parsers
3. Errors are scored and structured
4. When the process exits, results are returned

The output is parsed the same way as dev server logs - pytest failures get file:line extraction, TypeScript errors get TS code extraction, etc.

## Monorepo support

Use the `cwd` parameter to run commands in subdirectories:

```
run_and_watch(command: "npx vitest run", cwd: "./frontend")
run_and_watch(command: "pytest tests/", cwd: "./backend")
run_and_watch(command: "npx vite build", cwd: "./frontend")
```

No `cd` prefix needed. The command runs directly in the specified directory.

## WSL reliability

On WSL (Windows Subsystem for Linux), terminal output capture is unreliable. Kiro IDE and other tools often can't read test results from the terminal, forcing developers to pipe output through `tee` to log files.

`run_and_watch` bypasses this entirely:

| Method | How output travels | WSL reliable? |
|--------|-------------------|---------------|
| Shell command | Terminal stdout -> IDE reads terminal | No - breaks frequently |
| Shell + tee | Terminal -> tee -> log file -> agent reads file | Yes but clunky |
| `run_and_watch` | Node.js pipe -> parser pipeline -> JSON via MCP | Yes - separate channel |

The MCP protocol (JSON-RPC over stdio) is a completely separate channel from the terminal. WSL rendering issues don't affect it. The agent gets clean, parsed results every time.

## Security

Commands are validated against an allowlist: `npx`, `npm`, `node`, `pytest`, `python`, `tsc`, `eslint`, `vitest`, `jest`, `go test`, `cargo test`. Other commands are rejected.

## Language Coverage

| Language | Test Runner | Parser | Structured Output |
|----------|------------|--------|-------------------|
| **Node.js/TypeScript** | vitest | vitest-parser | Pass/fail count, file:line, assertions |
| **Node.js/TypeScript** | jest | jest-parser | Pass/fail count, file:line, Expected/Received |
| **Python** | pytest | pytest-parser | Pass/fail/warning count, file:line, error type |
| **Go** | go test | go-test-parser | FAIL with file:line |
| **Rust** | cargo test | cargo-test-parser | Pass/fail count, panic with file:line |
| **Java/Kotlin** | JUnit/Maven/Gradle | junit-parser | Surefire summary, Gradle task status, AssertionError |
| **Any language** | (no parser match) | raw output | Exit code, success/fail, raw text |

All test runners work with `run_and_watch` regardless of parser support. Parsers add structured extraction - without a parser, you still get exit code and raw output.

