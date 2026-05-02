# RuntimeEvent Schema

Every log line, error, warning, or build output that TracePulse processes becomes a **RuntimeEvent**. This is the core data structure that all MCP tools return.

## What a RuntimeEvent looks like

Here's a real example - a Python traceback caught by TracePulse:

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": 1714700000000,
  "source": "server-stderr",
  "service": "api",
  "level": "error",
  "message": "TypeError: 'NoneType' object is not subscriptable",
  "stack_trace": "  File \"app/routes/users.py\", line 42, in get_user\n    return user[\"name\"]",
  "fingerprint": "8f14e45f...",
  "signal_score": 72,
  "signal_strength": "high",
  "context": {
    "file": "app/routes/users.py",
    "line": 42,
    "framework": "python",
    "error_type": "TypeError"
  },
  "raw": "Traceback (most recent call last):\n  File \"app/routes/users.py\", line 42...",
  "first_seen": 1714700000000,
  "occurrence_count": 1
}
```

## Fields

### Identity

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUIDv4, unique per event. Generated when the event enters the ring buffer. |
| `timestamp` | number | Unix milliseconds when the log line was captured. |
| `fingerprint` | string | SHA-256 hash used for deduplication. Two identical errors produce the same fingerprint. This is what `get_error_trends` tracks across sessions. |

### Classification

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `source` | string | `server-stdout`, `server-stderr`, `build-error`, `docker-log` | Where the log line came from. Build tools (tsc, ESLint, Vite) produce `build-error`. |
| `service` | string | `main`, or the name you gave via `--service` | Which service produced this event. Defaults to `main` for single-process setups. |
| `level` | string | `error`, `warn`, `info`, `debug` | Severity level. Parsers determine this from the log content - a Python traceback is `error`, a deprecation notice is `warn`. |

### Content

| Field | Type | Limits | Description |
|-------|------|--------|-------------|
| `message` | string | Max 500 chars | The error message, extracted and cleaned. Long messages are truncated with `...`. |
| `stack_trace` | string or undefined | Max 15 frames | Stack trace if present. Framework frames are filtered out to show only your code. |
| `raw` | string | Max 1000 chars | The original log line(s) before parsing. Useful for debugging parser behavior. |

### Signal scoring

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `signal_score` | number | 0-100 | How important this event is. Higher = more likely to need attention. |
| `signal_strength` | string | `high`, `medium`, `low` | Human-readable tier derived from the score. |

**How scores are calculated:**

| Score range | Strength | Typical events |
|-------------|----------|----------------|
| 50-100 | **high** | Unhandled exceptions with user-code stack traces, HTTP 500s, panics |
| 20-49 | **medium** | Errors without stack traces, HTTP 4xx, failed assertions |
| 0-19 | **low** | Warnings, deprecation notices, hot-reload markers, info logs |

Scores factor in: error type, whether a stack trace points to user code (not node_modules), HTTP status codes, infrastructure patterns (connection refused, timeout), and recency.

### Context

The `context` object contains structured data extracted by parsers. Not all fields are present for every event - it depends on what the parser could extract.

| Field | Type | Description |
|-------|------|-------------|
| `file` | string | Source file path where the error occurred. |
| `line` | number | Line number in the source file. |
| `column` | number | Column number (when available, e.g., TypeScript errors). |
| `framework` | string | Which parser matched: `python`, `node`, `typescript`, `go`, `java`, `rust`, `pytest`, `jest`, `vite`, etc. |
| `error_type` | string | The error class: `TypeError`, `ReferenceError`, `ConnectionRefusedError`, etc. |
| `http_status` | number | HTTP status code for access log events (200, 404, 500, etc.). |
| `trace_id` | string | Correlation ID linking frontend and backend errors. |

### Deduplication

| Field | Type | Description |
|-------|------|-------------|
| `first_seen` | number | Unix ms when this fingerprint was first seen in the current session. |
| `occurrence_count` | number | How many times this exact error has occurred. Increments on each duplicate. |

When the same error occurs multiple times, TracePulse doesn't create duplicate events. Instead, it increments `occurrence_count` on the existing event and updates `timestamp` to the latest occurrence. The `fingerprint` is the dedup key.

## Examples by framework

### TypeScript build error

```json
{
  "source": "build-error",
  "level": "error",
  "message": "TS2345: Argument of type 'string' is not assignable to parameter of type 'number'",
  "signal_score": 55,
  "signal_strength": "high",
  "context": {
    "file": "src/utils/calc.ts",
    "line": 18,
    "column": 5,
    "framework": "typescript",
    "error_type": "TS2345"
  }
}
```

### HTTP 500 from access log

```json
{
  "source": "server-stdout",
  "level": "error",
  "message": "POST /api/users 500 Internal Server Error (234ms)",
  "signal_score": 65,
  "signal_strength": "high",
  "context": {
    "framework": "http-access",
    "http_status": 500
  }
}
```

### Hot-reload marker (low signal)

```json
{
  "source": "server-stdout",
  "level": "info",
  "message": "[vite] hmr update /src/App.tsx",
  "signal_score": 5,
  "signal_strength": "low",
  "context": {
    "framework": "vite"
  }
}
```

### pytest failure

```json
{
  "source": "server-stdout",
  "level": "error",
  "message": "FAILED tests/test_auth.py::test_login_invalid_password - AssertionError",
  "signal_score": 60,
  "signal_strength": "high",
  "context": {
    "file": "tests/test_auth.py",
    "framework": "pytest",
    "error_type": "AssertionError"
  }
}
```
