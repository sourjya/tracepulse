# Phase 4: Frontend-Backend Error Correlation - Requirements

## Overview

Phase 4 bridges the gap between browser errors and server errors. When a frontend HTTP request fails (4xx/5xx), the agent currently sees only one side - either the browser network failure (via Chrome DevTools MCP) or the server stack trace (via TracePulse). This phase correlates both sides into a single view, giving the agent the full picture of a failed request.

**Prerequisite:** Phase 3 (Multi-Process & Docker) complete and merged to main.

---

## User Stories

### US-1: Correlated Error Retrieval

**As** an AI coding agent using TracePulse,
**I want** to call `get_correlated_errors()` and receive pairs of frontend HTTP failures matched with their corresponding backend stack traces,
**So that** I can see both sides of a failed request without manually cross-referencing timestamps and URLs.

**Acceptance Criteria:**
- AC-1.1: `get_correlated_errors()` returns an array of `{ frontend_error, backend_error, correlation_confidence }` objects.
- AC-1.2: Each `frontend_error` contains at minimum: URL, HTTP method, status code, timestamp, and response headers (if available).
- AC-1.3: Each `backend_error` is a standard `RuntimeEvent` from the event buffer.
- AC-1.4: `correlation_confidence` is a number between 0 and 1 (inclusive), representing match quality.
- AC-1.5: When no correlated errors exist, the tool returns an empty array (not an error).
- AC-1.6: Results are ordered by timestamp descending (most recent first).

### US-2: URL-Filtered Correlation

**As** an AI coding agent,
**I want** to pass an optional `url` parameter to `get_correlated_errors(url)` to filter results to a specific endpoint,
**So that** I can focus on the exact request I'm debugging.

**Acceptance Criteria:**
- AC-2.1: When `url` is provided, only correlations where the frontend request URL contains the `url` string are returned.
- AC-2.2: URL matching is case-insensitive.
- AC-2.3: Partial URL matching works (e.g., `/api/users` matches `http://localhost:3000/api/users/123`).
- AC-2.4: When `url` is omitted, all correlated errors are returned (subject to default limit).

### US-3: Optional CDP Connection for Browser Network Data

**As** a developer configuring TracePulse,
**I want** CDP (Chrome DevTools Protocol) connection to be entirely optional,
**So that** TracePulse works without a browser and I only enable CDP when I need frontend-backend correlation.

**Acceptance Criteria:**
- AC-3.1: TracePulse starts and operates normally without any CDP connection configured.
- AC-3.2: CDP connection is enabled via CLI flag (`--cdp-url ws://localhost:9222`) or config.
- AC-3.3: When CDP is configured but Chrome is unreachable, TracePulse logs a warning to stderr and continues operating - all non-correlation tools work normally.
- AC-3.4: When CDP connects successfully, TracePulse captures network responses with 4xx/5xx status codes.
- AC-3.5: CDP disconnection mid-session is handled gracefully - a warning is logged, correlation tools return empty results, other tools are unaffected.

### US-4: ViewGraph Integration (Preferred Over Raw CDP)

**As** a developer running both TracePulse and ViewGraph,
**I want** TracePulse to pull network failure data from ViewGraph's MCP server instead of connecting to CDP directly,
**So that** I avoid duplicate CDP connections and get richer network context from ViewGraph's existing capture.

**Acceptance Criteria:**
- AC-4.1: When ViewGraph MCP server is detected (via configurable URL, default `http://localhost:9700`), TracePulse uses it as the network failure data source.
- AC-4.2: ViewGraph is preferred over raw CDP - if both are available, ViewGraph wins.
- AC-4.3: If ViewGraph becomes unreachable, TracePulse falls back to raw CDP (if configured), then to no frontend data.
- AC-4.4: The fallback chain is: ViewGraph → CDP → none. Each transition logs a warning to stderr.
- AC-4.5: The data source currently in use is reported by `get_runtime_status()` in a `correlation_source` field (`"viewgraph"` | `"cdp"` | `"log-collector"` | `"none"`).

### US-5: HTTP Correlation Algorithm

**As** the correlation engine,
**I want** to match frontend HTTP failures with backend errors using URL path matching and timestamp proximity,
**So that** correlations are accurate without requiring distributed tracing headers.

**Acceptance Criteria:**
- AC-5.1: A frontend 4xx/5xx response is correlated with a backend error if the URL path matches AND the timestamps are within ±2 seconds.
- AC-5.2: URL path matching compares the path component only (ignoring host, port, query string, fragment).
- AC-5.3: When multiple backend errors match a single frontend failure, the one with the closest timestamp is selected.
- AC-5.4: When a trace ID (`traceparent` or `x-datadog-trace-id`) is present in both frontend response headers and backend event context, it overrides URL+timestamp matching with confidence 1.0.
- AC-5.5: Correlation confidence scoring: trace ID match = 1.0; exact path + <500ms = 0.9; exact path + <2s = 0.7; partial path + <500ms = 0.6; partial path + <2s = 0.4.

### US-6: Trace ID Extraction

**As** the correlation engine,
**I want** to extract `traceparent` and `x-datadog-trace-id` headers from HTTP response headers captured via CDP or ViewGraph,
**So that** cross-service correlation is possible when distributed tracing is enabled.

**Acceptance Criteria:**
- AC-6.1: `traceparent` header is parsed per W3C Trace Context spec - trace ID (32 hex chars) is extracted.
- AC-6.2: `x-datadog-trace-id` header value is extracted as-is.
- AC-6.3: Extracted trace IDs are stored on the `FrontendError` object and used for correlation matching.
- AC-6.4: When both `traceparent` and `x-datadog-trace-id` are present, `traceparent` takes precedence.
- AC-6.5: Missing or malformed trace headers are silently ignored - correlation falls back to URL+timestamp.

### US-7: Internal Log Collector HTTP Server

**As** a future browser integration,
**I want** TracePulse to run an internal HTTP server on port 9801 that accepts structured error reports,
**So that** browser extensions or custom scripts can push frontend error data to TracePulse without CDP.

**Acceptance Criteria:**
- AC-7.1: HTTP server listens on port 9801 (configurable via `--collector-port`).
- AC-7.2: Server is disabled by default - enabled via `--enable-collector` flag.
- AC-7.3: Accepts POST requests to `/api/v1/errors` with a JSON body conforming to the `FrontendError` schema.
- AC-7.4: Validates incoming payloads - rejects malformed requests with 400 and a structured error response.
- AC-7.5: Accepted errors enter the correlation pipeline identically to CDP/ViewGraph-sourced errors.
- AC-7.6: Server binds to `127.0.0.1` only - no external network exposure.
- AC-7.7: Rate-limited to 100 requests per second to prevent abuse.

### US-8: Frontend Error Ring Buffer

**As** the correlation engine,
**I want** frontend errors stored in a bounded ring buffer (separate from the backend event buffer),
**So that** memory usage is bounded and old frontend errors are evicted automatically.

**Acceptance Criteria:**
- AC-8.1: Frontend errors are stored in a dedicated ring buffer with a max size of 200 entries.
- AC-8.2: When the buffer is full, the oldest entry is evicted.
- AC-8.3: `clear_errors()` also clears the frontend error buffer.
- AC-8.4: Frontend errors older than 5 minutes are eligible for eviction on the next insert (TTL-based cleanup).

---

## Non-Functional Requirements

### NFR-1: Performance

- Correlation lookup (`get_correlated_errors`) must complete in <50ms for buffers at max capacity (500 backend + 200 frontend events).
- CDP event processing must not add >5ms latency to the main event pipeline.
- Log collector HTTP server must handle 100 req/s sustained without dropping requests.

### NFR-2: Memory

- Frontend error buffer adds at most 2MB to TracePulse's memory footprint (200 entries × ~10KB max each).
- CDP connection overhead must not exceed 10MB RSS.

### NFR-3: Reliability

- CDP disconnection must not crash TracePulse or affect non-correlation tools.
- ViewGraph unavailability must not crash TracePulse or affect non-correlation tools.
- Log collector server crash must not affect the main MCP server.

### NFR-4: Security

- Secret redaction runs on all frontend error data before it enters the buffer (same pipeline as backend events).
- Log collector server binds to localhost only.
- Log collector validates Content-Type (`application/json` only).
- No raw CDP data is exposed in MCP tool responses - only the structured `FrontendError` subset.

### NFR-5: Observability

- Every CDP connect/disconnect event is logged to stderr with timestamp.
- Every ViewGraph fallback transition is logged to stderr.
- Correlation operations log: source count, match count, duration.

---

## Out of Scope

- **Browser DOM inspection** - Chrome DevTools MCP and ViewGraph own this.
- **Browser console log capture** - Chrome DevTools MCP's `list_console_messages` handles this.
- **JavaScript error capture** - Only HTTP network failures (4xx/5xx) are captured, not JS runtime errors.
- **CDP-based browser automation** - No clicking, navigating, or interacting with the browser.
- **Production distributed tracing** - Trace ID extraction is opportunistic; TracePulse does not inject or propagate trace headers.
- **WebSocket error correlation** - Only HTTP request/response failures. WebSocket monitoring is deferred.
- **Custom correlation rules** - The correlation algorithm is fixed (URL + timestamp + trace ID). User-defined rules are deferred.
- **Multi-browser support** - CDP targets Chrome/Chromium only. Firefox/Safari CDP equivalents are deferred.
- **Persistent storage of frontend errors** - Frontend error buffer is ephemeral (same as backend buffer).
