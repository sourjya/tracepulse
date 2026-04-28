# M7: Agent-Driven Enhancements - Design

## Architecture

M7 adds no new architectural layers. All features extend existing modules:

```
Existing Pipeline (unchanged):
  Raw Line -> ANSI Strip -> Secret Redact -> Hot-Reload Check -> Parser Registry -> Normalize -> Score -> Buffer

M7a additions:
  - Multiple LogFileTailers feeding the same pipeline (multi-file attach)
  - New HTTP access log parser in registry (uvicorn, express, nginx)
  - New filter field on EventFilters (status_code_min)
  - context.http_status on RuntimeEvent

M7b additions:
  - New pytest parser in registry
  - New jest parser in registry

M7c additions:
  - 4 new SKILL.md files (no code changes)
  - last_event_timestamp field on get_errors response
```

---

## M7a: Multi-File Attach

### Data Flow

```
./logs/backend.log  --> LogFileTailer("backend")  --\
                                                     +--> ServiceRegistry
./logs/frontend.log --> LogFileTailer("frontend") --/         |
                                                              v
                                                    Shared Pipeline
                                                         |
                                                    Ring Buffer (500)
                                                         |
                                                    MCP Tools (13)
```

### CLI Parsing

```
tracepulse attach --log-file backend=./logs/backend.log --log-file frontend=./logs/frontend.log
```

Parsed as:
```typescript
interface AttachArgs {
  command: "attach";
  logFiles: Array<{ name: string; path: string }>;  // was: logFile: string
}
```

Backward compat: `--log-file ./server.log` -> `[{ name: "server", path: "./server.log" }]`

### HTTP Access Log Parser

Patterns:
```
// uvicorn
INFO:     127.0.0.1:54321 - "GET /api/users HTTP/1.1" 200
// express/morgan
GET /api/users 200 15.234 ms
// nginx combined
127.0.0.1 - - [28/Apr/2026:10:00:00 +0000] "GET /api/users HTTP/1.1" 200 1234
```

Extracted fields:
```typescript
{
  message: "GET /api/users 200",
  level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
  context: {
    http_status: 200,
    file: "/api/users",  // URL path stored as "file" for filtering
    framework: "uvicorn" | "express" | "nginx",
  },
  scoring_hints: {
    http_status: 200,  // scorer uses this for +15 (5xx) or +10 (4xx)
  }
}
```

### Status Code Filter

Add to EventFilters:
```typescript
interface EventFilters {
  // ... existing fields
  status_code_min?: number;  // only events with context.http_status >= this value
}
```

Ring buffer `matches()` function:
```typescript
if (filters.status_code_min !== undefined) {
  const status = (event.context as any).http_status;
  if (status === undefined || status < filters.status_code_min) return false;
}
```

---

## M7b: Test Runner Parsers

### Pytest Parser

Input patterns:
```
FAILED tests/test_auth.py::test_login_invalid - AssertionError: assert 401 == 200
FAILED tests/test_auth.py::test_login_invalid
ERROR tests/test_auth.py - ImportError: cannot import name 'login'
===== 2 failed, 15 passed, 1 error in 3.45s =====
```

Output:
```typescript
{
  message: "test_login_invalid - AssertionError: assert 401 == 200",
  level: "error",
  context: {
    file: "tests/test_auth.py",
    error_type: "AssertionError",
    framework: "pytest",
  },
  scoring_hints: { is_user_code: true, has_stack_trace: false }
}
```

### Jest Parser

Input patterns:
```
FAIL src/auth.test.ts
  x should login with valid credentials (15 ms)

    expect(received).toBe(expected)

    Expected: 200
    Received: 401

      12 |   const res = await login(creds);
      13 |   expect(res.status).toBe(200);
         |                      ^
```

Output:
```typescript
{
  message: "should login with valid credentials - Expected: 200, Received: 401",
  level: "error",
  context: {
    file: "src/auth.test.ts",
    line: 13,
    error_type: "expect.toBe",
    framework: "jest",
  },
  scoring_hints: { is_user_code: true, has_stack_trace: false }
}
```

---

## M7c: Skills

No code changes. Four new SKILL.md files:

| Skill | File | Orchestrates |
|-------|------|-------------|
| Audit All Endpoints | `skills/audit-endpoints/SKILL.md` | TracePulse + Chrome DevTools MCP |
| Debugger Mode | `skills/debugger-mode/SKILL.md` | TracePulse (all tools) |
| GitHub Issue from Error | `skills/github-issue/SKILL.md` | TracePulse + GitHub MCP |
| Test Runner | `skills/test-runner/SKILL.md` | TracePulse |

### `last_event_timestamp`

Add to `get_errors` response:
```typescript
{
  errors: [...],
  total_matching: 15,
  session_started_at: ...,
  oldest_event_at: ...,
  buffer_cleared_at: ...,
  last_event_timestamp: 1714300005000  // NEW - timestamp of newest event in errors array
}
```

---

## Files to Change

### M7a
| File | Change |
|------|--------|
| `src/cli.ts` | Parse multiple `--log-file` flags, create multiple tailers |
| `src/types/events.ts` | Add `status_code_min` to EventFilters, add `http_status` to EventContext |
| `src/store/ring-buffer.ts` | Add `status_code_min` filter in `matches()` |
| `src/parsers/http-access-log-parser.ts` | NEW - uvicorn/express/nginx parser |
| `src/pipeline/parser-registry.ts` | Register HTTP access log parser |
| `src/mcp/server.ts` | Add `status_code_min` to tool schemas |
| `src/pipeline/signal-scorer.ts` | Use `http_status` from scoring hints |

### M7b
| File | Change |
|------|--------|
| `src/parsers/test/pytest-parser.ts` | NEW - pytest output parser |
| `src/parsers/test/jest-parser.ts` | NEW - jest output parser |
| `src/parsers/test/index.ts` | NEW - barrel export |
| `src/pipeline/parser-registry.ts` | Register test parsers |

### M7c
| File | Change |
|------|--------|
| `skills/audit-endpoints/SKILL.md` | NEW |
| `skills/debugger-mode/SKILL.md` | NEW |
| `skills/github-issue/SKILL.md` | NEW |
| `skills/test-runner/SKILL.md` | NEW |
| `src/mcp/server.ts` | Add `last_event_timestamp` to get_errors response |
