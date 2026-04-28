# Implementation Plan: Phase 4 — Frontend-Backend Error Correlation

## Overview

Phase 4 adds frontend error ingestion (CDP, ViewGraph, HTTP collector), a correlation engine that matches browser HTTP failures with backend stack traces, and the `get_correlated_errors` MCP tool.

**Prerequisite:** Phase 3 (Multi-Process & Docker) complete and merged to main.

**Architecture References:**
- `docs/ideas/feature-architecture-analysis.md` — Phase 4 feature set, Decision 7 (signal scoring), Appendix D (Clipboard Health trace ID pattern), Appendix E (Chrome DevTools MCP architecture)
- `.kiro/specs/phase4-correlation/design.md` — component design, correlation algorithm, data model
- `.kiro/specs/phase4-correlation/requirements.md` — user stories US-1 through US-8, NFRs

**Key Principles:**
- CDP connection is OPTIONAL — TracePulse works without it
- ViewGraph preferred over raw CDP when available
- All frontend data goes through secret redaction before buffering
- Correlation engine is stateless — reads both buffers on each call
- stdout reserved for MCP JSON-RPC — all diagnostic output to stderr

**Development Approach — TDD MANDATORY:**
- **RED → GREEN → REFACTOR**: Write failing tests FIRST, then minimal implementation, then refactor
- NEVER write implementation code before its test
- Each phase below follows strict TDD ordering: tests before implementation
- See `testing-standards.md` for complete TDD guidelines

**Testing Strategy:**
- Unit tests for all pure functions (trace ID extraction, correlation algorithm, buffer, URL matching)
- Unit tests with mocks for source adapters (CDP, ViewGraph, log collector)
- Integration test for the full correlation flow (source → buffer → engine → MCP tool)

## Tasks

### Phase 1: Data Model, Constants & Frontend Error Buffer

Foundation layer — types, constants, and the frontend ring buffer.

#### Step 1: Types and Constants — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 1.1 Write unit tests for trace ID extraction
  - Test valid `traceparent` header → extracts 32-char hex trace ID
  - Test valid `x-datadog-trace-id` header → extracts value as-is
  - Test both headers present → `traceparent` takes precedence
  - Test malformed `traceparent` (wrong length, non-hex) → returns undefined
  - Test missing headers → returns `{ traceId: undefined, datadogTraceId: undefined }`
  - Test case-insensitive header names
  - File: `tests/unit/correlation/test-trace-id-extractor.test.ts`
  - _Requirements: US-6 (AC-6.1 through AC-6.5)_

**GREEN Phase: Implement to Pass Tests**
- [ ] 1.2 Create Phase 4 types
  - Create `src/correlation/types.ts` — `FrontendError`, `CorrelatedError`, `CorrelationSourceType`, `CorrelationConfig` interfaces
  - _Requirements: US-1 (AC-1.1 through AC-1.3), US-4 (AC-4.5)_

- [ ] 1.3 Create Phase 4 constants
  - Create `src/constants/correlation.ts` — all constants from design.md (buffer sizes, TTLs, confidence scores, ports, intervals)
  - _Requirements: US-5 (AC-5.5), US-7 (AC-7.1), US-8 (AC-8.1, AC-8.4)_

- [ ] 1.4 Implement trace ID extractor
  - Create `src/correlation/trace-id-extractor.ts`
  - Implement `extractTraceIds(headers)` pure function
  - Parse `traceparent` per W3C Trace Context spec (version-traceid-parentid-flags)
  - Extract `x-datadog-trace-id` as-is
  - All tests from 1.1 pass
  - _Requirements: US-6 (AC-6.1 through AC-6.5)_

#### Step 2: Frontend Error Buffer — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 2.1 Write unit tests for frontend error buffer
  - Test push and retrieve — pushed errors appear in `getAll()`
  - Test max size eviction — 201st push evicts the oldest entry
  - Test TTL eviction — errors older than 5 minutes are cleaned on next push
  - Test `getByUrl(url)` — case-insensitive partial URL matching
  - Test `clear()` — empties the buffer, `size()` returns 0
  - Test `size()` — returns current count
  - Test ordering — `getAll()` returns newest first
  - File: `tests/unit/correlation/test-frontend-error-buffer.test.ts`
  - _Requirements: US-8 (AC-8.1 through AC-8.4)_

**GREEN Phase: Implement to Pass Tests**
- [ ] 2.2 Implement frontend error buffer
  - Create `src/correlation/frontend-error-buffer.ts`
  - Ring buffer with max size from `FRONTEND_BUFFER_MAX_SIZE` constant
  - TTL cleanup on each `push()` using `FRONTEND_ERROR_TTL_MS`
  - `getByUrl()` filters with case-insensitive substring match
  - All tests from 2.1 pass
  - _Requirements: US-8 (AC-8.1 through AC-8.4)_

**REFACTOR Phase: Clean Up**
- [ ] 2.3 Refactor buffer if needed
  - Consider extracting shared ring buffer logic if it duplicates the backend event buffer
  - Ensure all tests still pass

#### Checkpoint: Phase 1 Complete

- [ ] All tests passing (`npm run test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Types, constants, trace ID extractor, and frontend buffer are implemented
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 2: Correlation Engine

The core matching algorithm — pure logic, no I/O.

#### Step 3: Correlation Engine — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 3.1 Write unit tests for correlation engine
  - Test trace ID match — frontend and backend share trace ID → confidence 1.0, method "trace-id"
  - Test exact path + close timestamp (<500ms) → confidence 0.9
  - Test exact path + far timestamp (<2000ms) → confidence 0.7
  - Test partial path + close timestamp → confidence 0.6
  - Test partial path + far timestamp → confidence 0.4
  - Test no match — timestamps >2s apart → no correlation returned
  - Test URL filter — only matching frontend errors are considered
  - Test URL filter case-insensitivity
  - Test multiple backend candidates — closest timestamp wins
  - Test empty buffers → returns empty array
  - Test results ordered by timestamp descending
  - Test trace ID match takes priority over URL+timestamp match
  - Test path extraction from backend error message (regex: `GET /api/users`)
  - Test partial path matching (prefix match, shared segments)
  - File: `tests/unit/correlation/test-correlation-engine.test.ts`
  - _Requirements: US-1 (AC-1.1 through AC-1.6), US-2 (AC-2.1 through AC-2.4), US-5 (AC-5.1 through AC-5.5)_

**GREEN Phase: Implement to Pass Tests**
- [ ] 3.2 Implement correlation engine
  - Create `src/correlation/correlation-engine.ts`
  - Implement `correlate(options?)` method
  - Step 1: pre-filter frontend buffer by URL if filter provided
  - Step 2: for each frontend error, try trace ID match first
  - Step 3: fall back to URL path + timestamp proximity matching
  - Step 4: score each match per confidence table in design.md
  - Step 5: sort results by timestamp descending
  - Path extraction from backend errors via `context.url`, message regex, raw log regex
  - All tests from 3.1 pass
  - _Requirements: US-1, US-2, US-5_

**REFACTOR Phase: Clean Up**
- [ ] 3.3 Refactor correlation engine if needed
  - Extract path matching into a separate pure function if complex
  - Ensure all tests still pass

#### Checkpoint: Phase 2 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Correlation engine handles all match tiers and edge cases
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 3: Frontend Error Sources

Three data source adapters: CDP listener, ViewGraph bridge, log collector HTTP server.

#### Step 4: CDP Listener — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 4.1 Write unit tests for CDP listener
  - Test: receives `Network.responseReceived` with 500 → emits `FrontendError`
  - Test: receives `Network.responseReceived` with 200 → no emission (not a failure)
  - Test: receives `Network.responseReceived` with 404 → emits `FrontendError`
  - Test: extracts trace IDs from response headers
  - Test: connection failure → logs warning, does not throw
  - Test: disconnect → attempts reconnect with backoff
  - Test: max reconnect attempts exceeded → gives up, emits "disconnected" event
  - Test: `stop()` closes connection cleanly
  - File: `tests/unit/correlation/sources/test-cdp-listener.test.ts`
  - _Requirements: US-3 (AC-3.1 through AC-3.5)_

**GREEN Phase: Implement to Pass Tests**
- [ ] 4.2 Implement CDP listener
  - Create `src/correlation/sources/cdp-listener.ts`
  - Connect to Chrome via `chrome-remote-interface` (add dependency — ask user first)
  - Enable `Network` domain, listen for `responseReceived` events
  - Filter for 4xx/5xx status codes
  - Normalize to `FrontendError` with trace ID extraction
  - Exponential backoff reconnect (1s → 2s → 4s, max 30s, 3 attempts)
  - All tests from 4.1 pass
  - _Requirements: US-3_

#### Step 5: ViewGraph Bridge — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 5.1 Write unit tests for ViewGraph bridge
  - Test: polls ViewGraph endpoint → transforms response to `FrontendError[]`
  - Test: ViewGraph unreachable on startup → bridge starts in "unavailable" mode
  - Test: ViewGraph becomes unreachable mid-session → falls back after 3 failures
  - Test: ViewGraph recovers → bridge resumes using ViewGraph
  - Test: `stop()` clears polling interval
  - Test: deduplicates errors already seen (by URL + timestamp)
  - File: `tests/unit/correlation/sources/test-viewgraph-bridge.test.ts`
  - _Requirements: US-4 (AC-4.1 through AC-4.4)_

**GREEN Phase: Implement to Pass Tests**
- [ ] 5.2 Implement ViewGraph bridge
  - Create `src/correlation/sources/viewgraph-bridge.ts`
  - HTTP polling via `node:http` (no external dep) to ViewGraph URL
  - Poll every 2 seconds (`VIEWGRAPH_POLL_INTERVAL_MS`)
  - Transform ViewGraph network data to `FrontendError` format
  - Track consecutive failures, fall back after `VIEWGRAPH_MAX_FAILURES`
  - All tests from 5.1 pass
  - _Requirements: US-4_

#### Step 6: Log Collector HTTP Server — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 6.1 Write unit tests for log collector
  - Test: POST `/api/v1/errors` with valid payload → 201, error emitted
  - Test: POST with malformed JSON → 400 with structured error
  - Test: POST with missing required fields → 400 with validation details
  - Test: POST with wrong Content-Type → 400
  - Test: POST with oversized body → 413
  - Test: GET `/api/v1/health` → 200 `{ status: "ok" }`
  - Test: rate limit exceeded → 429
  - Test: server binds to 127.0.0.1 only
  - Test: `stop()` closes server cleanly
  - File: `tests/unit/correlation/sources/test-log-collector.test.ts`
  - _Requirements: US-7 (AC-7.1 through AC-7.7)_

**GREEN Phase: Implement to Pass Tests**
- [ ] 6.2 Implement log collector HTTP server
  - Create `src/correlation/sources/log-collector.ts`
  - `node:http` server on `127.0.0.1:9801` (configurable)
  - Route: POST `/api/v1/errors` — validate, normalize to `FrontendError`, emit
  - Route: GET `/api/v1/health` — return `{ status: "ok" }`
  - Content-Type check, body size limit (64KB), payload validation
  - Token bucket rate limiter (100 req/s)
  - All tests from 6.1 pass
  - _Requirements: US-7_

**REFACTOR Phase: Clean Up**
- [ ] 6.3 Refactor source adapters if needed
  - Extract common adapter interface if patterns emerge
  - Ensure all tests still pass

#### Checkpoint: Phase 3 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] All three source adapters implemented and tested
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 4: Source Manager & MCP Tool Integration

Wire everything together: source manager orchestrates adapters, MCP tool exposes correlation.

#### Step 7: Source Manager — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 7.1 Write unit tests for source manager
  - Test: ViewGraph available + CDP configured → uses ViewGraph
  - Test: ViewGraph unavailable + CDP configured → uses CDP
  - Test: ViewGraph unavailable + CDP unavailable + collector enabled → uses collector
  - Test: nothing configured → `activeSource` is "none"
  - Test: ViewGraph goes down mid-session → falls back to CDP
  - Test: `onError` callback receives errors from whichever source is active
  - Test: `stop()` stops all sources
  - Test: `activeSource` reflects current state after transitions
  - File: `tests/unit/correlation/test-source-manager.test.ts`
  - _Requirements: US-4 (AC-4.2 through AC-4.5)_

**GREEN Phase: Implement to Pass Tests**
- [ ] 7.2 Implement source manager
  - Create `src/correlation/source-manager.ts`
  - Implement fallback chain: ViewGraph → CDP → Log Collector → None
  - Probe ViewGraph on startup and every 30 seconds
  - Route incoming errors from active source to registered callback
  - Log source transitions to stderr
  - All tests from 7.1 pass
  - _Requirements: US-4_

#### Step 8: MCP Tool Handler — TDD Cycle

**RED Phase: Write Tests First**
- [ ] 8.1 Write unit tests for `get_correlated_errors` MCP tool handler
  - Test: returns correlated errors as JSON in MCP content format
  - Test: URL filter parameter is passed through to correlation engine
  - Test: empty results → returns empty array (not error)
  - Test: response includes `frontend_error`, `backend_error`, `correlation_confidence`, `match_method`
  - File: `tests/unit/correlation/test-get-correlated-errors-tool.test.ts`
  - _Requirements: US-1 (AC-1.1 through AC-1.6), US-2 (AC-2.1 through AC-2.4)_

- [ ] 8.2 Write unit tests for extended `get_runtime_status`
  - Test: response includes `correlation_source` field
  - Test: response includes `frontend_error_count` field
  - Test: `correlation_source` reflects source manager's active source
  - File: `tests/unit/correlation/test-runtime-status-extension.test.ts`
  - _Requirements: US-4 (AC-4.5)_

**GREEN Phase: Implement to Pass Tests**
- [ ] 8.3 Implement `get_correlated_errors` MCP tool handler
  - Create `src/tools/get-correlated-errors.ts`
  - Pure function: reads from correlation engine, formats as MCP response
  - Register tool with MCP server in `src/index.ts`
  - All tests from 8.1 pass
  - _Requirements: US-1, US-2_

- [ ] 8.4 Extend `get_runtime_status` with correlation fields
  - Add `correlation_source` and `frontend_error_count` to status response
  - All tests from 8.2 pass
  - _Requirements: US-4 (AC-4.5)_

#### Step 9: Wire Up — Integration

- [ ] 9.1 Integrate source manager with frontend buffer and correlation engine
  - Source manager `onError` → secret redaction → `frontendBuffer.push()`
  - `get_correlated_errors` tool → `correlationEngine.correlate()` reading both buffers
  - `clear_errors` tool → also calls `frontendBuffer.clear()`
  - _Requirements: US-8 (AC-8.3)_

- [ ] 9.2 Add CLI flags for Phase 4 configuration
  - `--cdp-url`, `--viewgraph-url`, `--enable-collector`, `--collector-port`, `--no-viewgraph`, `--correlation-window`
  - Parse in CLI entry point, pass to source manager config
  - _Requirements: US-3 (AC-3.2), US-7 (AC-7.1, AC-7.2)_

- [ ] 9.3 Add graceful shutdown for Phase 4 components
  - On SIGINT/SIGTERM: stop log collector, disconnect CDP, stop ViewGraph polling
  - Shutdown before forwarding signal to child process
  - _Requirements: NFR-3_

#### Checkpoint: Phase 4 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Source manager orchestrates all three sources with correct fallback
- [ ] MCP tool registered and returns correct response format
- [ ] `get_runtime_status` extended with correlation fields
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 5: Integration Test & Security Checkpoint

End-to-end validation and security review.

#### Step 10: Integration Test

- [ ] 10.1 Write integration test for full correlation flow
  - Push a `FrontendError` via log collector HTTP endpoint
  - Inject a matching `RuntimeEvent` into the backend buffer
  - Call `get_correlated_errors` → verify the pair is returned with correct confidence
  - Call `get_correlated_errors(url)` → verify URL filtering works
  - Call `get_runtime_status` → verify `correlation_source` and `frontend_error_count`
  - Call `clear_errors` → verify both buffers are cleared
  - File: `tests/integration/test-correlation-flow.test.ts`
  - _Requirements: US-1, US-2, US-4 (AC-4.5), US-7, US-8 (AC-8.3)_

#### Step 11: Security Checkpoint

- [ ] 11.1 Verify secret redaction on frontend errors
  - Confirm `SecretRedactor` runs on all `FrontendError` fields (URL, headers, body snippet, raw)
  - Confirm no raw CDP data leaks into MCP responses
  - _Requirements: NFR-4_

- [ ] 11.2 Verify log collector security
  - Confirm server binds to `127.0.0.1` only (not `0.0.0.0`)
  - Confirm Content-Type validation rejects non-JSON
  - Confirm body size limit enforced
  - Confirm rate limiting works
  - _Requirements: NFR-4, US-7 (AC-7.6, AC-7.7)_

- [ ] 11.3 Verify no secrets in constants or config
  - No hardcoded URLs with credentials
  - No API keys in source files
  - CDP URL read from CLI args only

#### Checkpoint: Phase 5 Complete — Phase 4 Done

- [ ] All unit tests passing
- [ ] Integration test passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Security checkpoint passed
- [ ] Build succeeds (`npm run build`)
- [ ] Changelog updated with Phase 4 entry
- [ ] Changes committed and merged to main

---

## TDD Reminders

**Before writing ANY implementation code, ask yourself:**
1. Have I written a test for this functionality?
2. Have I seen that test FAIL for the right reason?
3. Am I writing the MINIMAL code to make the test pass?

**If the answer to any of these is NO, STOP and write the test first.**

## Task Status Legend

- `[ ]` = Not started
- `[-]` = In progress
- `[x]` = Completed
