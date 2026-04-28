# M7: Agent-Driven Enhancements - Requirements

## Overview

Features driven by real agent feedback from PlanIQ testing and competitive research. Three sub-milestones, each independently shippable.

## M7a: Multi-File Attach + Status Code Filter (v0.7.0)

### US-1: Multi-File Attach Mode

**As** an AI coding agent monitoring a multi-service dev setup,
**I want** TracePulse to tail multiple log files simultaneously,
**So that** I can see errors from backend, frontend, and worker processes in one place.

**Acceptance Criteria:**
1. `tracepulse attach --log-file backend=./logs/backend.log --log-file frontend=./logs/frontend.log` tails both files
2. Each file registered as a separate service in ServiceRegistry
3. Events tagged with service name derived from the `name=` prefix or filename
4. `list_services` shows all tailed files with status
5. `get_errors(service: "backend")` filters to one file's events
6. `watch_for_errors` detects hot-reload from ANY tailed file
7. Unnamed files derive service name from filename (strip path + extension)
8. Backward compatible: single `--log-file ./server.log` still works

### US-2: HTTP Status Code Filter

**As** an AI coding agent debugging API errors,
**I want** to filter server logs by HTTP status code,
**So that** I can see only 4xx/5xx responses without scanning hundreds of 200 OK lines.

**Acceptance Criteria:**
1. `get_errors(status_code_min: 400)` returns only events where parsed status >= 400
2. `get_server_logs(status_code_min: 500)` returns only 5xx events
3. Status code extracted from HTTP access log lines (uvicorn, express, nginx formats)
4. Status code stored in `context.http_status` on RuntimeEvent
5. Works with `message_contains` filter (combinable)
6. Events without HTTP status are excluded when filter is active

### US-3: HTTP Access Log Parser

**As** TracePulse,
**I want** to parse HTTP access log lines into structured events,
**So that** status code filtering and request-level queries work.

**Acceptance Criteria:**
1. Parses uvicorn format: `INFO: 127.0.0.1:8000 - "GET /api/users HTTP/1.1" 200`
2. Parses express/morgan format: `GET /api/users 200 15ms`
3. Parses nginx combined format: `127.0.0.1 - - [28/Apr/2026] "GET /api/users HTTP/1.1" 200 1234`
4. Extracts: method, path, status_code, duration_ms (when available)
5. Sets `context.http_status`, `context.file` (as path), `context.framework`
6. Signal scoring: 5xx gets +15, 4xx gets +10, 2xx/3xx stays low
7. Registered in parser registry after structlog, before Node.js parser

### NFRs
- Backward compatible: single-file attach unchanged
- All existing tests pass
- New parsers have unit tests with real log samples

---

## M7b: Test Runner Integration (v0.7.1)

### US-4: Pytest Output Parser

**As** an AI coding agent running Python tests,
**I want** TracePulse to parse pytest output into structured error events,
**So that** test failures appear in `get_errors` with file, line, and test name.

**Acceptance Criteria:**
1. Parses `FAILED tests/test_auth.py::test_login - AssertionError: ...`
2. Parses `ERROR tests/test_auth.py::test_login` (collection errors)
3. Extracts: file, test function name, error message, assertion details
4. Sets `source: "build-error"`, `context.framework: "pytest"`
5. `PASSED` lines are info-level (low signal)
6. `FAILED` lines are error-level (high signal, score >= 50)
7. Summary line (`3 failed, 10 passed`) parsed as single event

### US-5: Jest Output Parser

**As** an AI coding agent running JavaScript tests,
**I want** TracePulse to parse Jest output into structured error events,
**So that** test failures appear in `get_errors` with file, line, and test name.

**Acceptance Criteria:**
1. Parses `FAIL src/auth.test.ts` header
2. Parses `x test name (5ms)` failure lines with indented error details
3. Parses `Expected: X, Received: Y` assertion details
4. Extracts: file, test name, expected/received values
5. Sets `source: "build-error"`, `context.framework: "jest"`
6. Summary line parsed as single event

### US-6: Test Runner Skill

**As** an AI coding agent,
**I want** a skill file that teaches me how to use TracePulse with test runners,
**So that** I know the workflow for running tests and checking results.

**Acceptance Criteria:**
1. Skill file at `skills/test-runner/SKILL.md`
2. Covers: `tracepulse start "pytest --watch"` and `tracepulse start "npx jest --watch"`
3. Workflow: run tests -> `get_errors` -> fix -> re-run -> verify clean
4. Documents which fields to look at (test name, assertion details)

### NFRs
- Parsers handle colored output (ANSI already stripped by pipeline)
- Works in both start mode (`tracepulse start "pytest"`) and attach mode

---

## M7c: Agent Workflow Skills (v0.7.2)

### US-7: "Audit All Endpoints" Skill

**As** an AI coding agent,
**I want** a structured workflow for auditing all API endpoints,
**So that** I can verify the entire backend is healthy in one pass.

**Acceptance Criteria:**
1. Skill file at `skills/audit-endpoints/SKILL.md`
2. Step 1: Find all routes (read routes file, OpenAPI spec, or Django urls.py)
3. Step 2: For each endpoint, use Chrome DevTools MCP to make a request
4. Step 3: Check TracePulse `get_errors(message_contains: "/api/endpoint")` for each
5. Step 4: Report clean endpoints vs erroring endpoints with details
6. Inspired by CyberAgent's 236-story Storybook audit pattern

### US-8: "Debugger Mode" Skill

**As** an AI coding agent,
**I want** a single-command structured debugging workflow,
**So that** I can go from "something broke" to "here's the fix" in a systematic way.

**Acceptance Criteria:**
1. Skill file at `skills/debugger-mode/SKILL.md`
2. Triggered by user saying "enter debugger mode" or "debug this"
3. Workflow: `get_runtime_status` -> `get_errors` -> `get_error_context` -> read source -> propose fix -> `watch_for_errors` -> verify
4. Decision tree for high/medium/low signal errors
5. Includes Chrome DevTools MCP steps for frontend-related issues
6. Inspired by BrowserTools MCP's "Debugger Mode" UX pattern

### US-9: "GitHub Issue from Error" Skill

**As** an AI coding agent,
**I want** to create a GitHub issue from a TracePulse error,
**So that** errors are tracked in the project's issue tracker.

**Acceptance Criteria:**
1. Skill file at `skills/github-issue/SKILL.md`
2. Workflow: `get_errors` -> pick highest signal -> format as GitHub issue -> use GitHub MCP to create issue
3. Issue includes: error message, file:line, stack trace, signal score, occurrence count
4. Labels: `bug`, `tracepulse`, severity level

### US-10: `last_event_timestamp` in Responses

**As** an AI coding agent calling `get_errors` repeatedly,
**I want** the response to include the timestamp of the newest event returned,
**So that** I can pass it as `since` on my next call to avoid re-reading old errors.

**Acceptance Criteria:**
1. `get_errors` response includes `last_event_timestamp` field
2. Value is the timestamp of the newest event in the `errors` array, or null if empty
3. Agent can do: `get_errors(since: <last_event_timestamp from previous call>)`
4. Documented in SKILL.md "Pro Tips" section
