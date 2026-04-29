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
2. stdout/stderr are piped through all 20 parsers
3. Errors are scored and structured
4. When the process exits, results are returned

The output is parsed the same way as dev server logs - pytest failures get file:line extraction, TypeScript errors get TS code extraction, etc.

## Security

Commands are validated against an allowlist: `npx`, `npm`, `node`, `pytest`, `python`, `tsc`, `eslint`, `vitest`, `jest`, `go test`, `cargo test`, `make`, `bash`. Other commands are rejected.
