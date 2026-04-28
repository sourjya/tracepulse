# Phase 4: Frontend-Backend Error Correlation - Design

> **Hardening Reference:** See [Collector Pitfalls & Hardening Guide](../../../docs/references/collector-pitfalls-hardening.md) for known failure modes. Phase 4's CDP/ViewGraph/HTTP collector error handling is already comprehensive. All inherited pipeline hardening (ANSI stripping, line length guard, secret redaction) applies to frontend error data as well.

## Architecture Overview

Phase 4 adds a frontend error ingestion layer and a correlation engine that sits between the existing event buffer and the MCP tool handlers. Three data sources feed frontend errors into a dedicated ring buffer; the correlation engine joins them with backend `RuntimeEvent`s on demand.

```
                                ┌─────────────────────────┐
                                │   MCP Tool Handlers     │
                                │                         │
                                │  get_correlated_errors  │
                                │  get_runtime_status     │
                                │  (extended)             │
                                └────────┬────────────────┘
                                         │ reads both buffers
                          ┌──────────────┼──────────────┐
                          │              │              │
                ┌─────────▼──────┐  ┌────▼─────────────▼──┐
                │ Backend Event  │  │ Frontend Error       │
                │ Buffer (500)   │  │ Buffer (200)         │
                │ (Phase 1-3)    │  │ (NEW - Phase 4)      │
                └────────────────┘  └──────────┬───────────┘
                                               │
                                    ┌──────────┼──────────┐
                                    │          │          │
                              ┌─────▼───┐ ┌───▼────┐ ┌───▼──────────┐
                              │ViewGraph│ │  CDP   │ │Log Collector │
                              │ Bridge  │ │Listener│ │HTTP (9801)   │
                              └─────────┘ └────────┘ └──────────────┘
                                    ▲          ▲
                                    │          │
                              ViewGraph    Chrome
                              MCP Server   (CDP)
```

### Data Flow

1. **Ingestion**: Frontend errors arrive from one of three sources (ViewGraph bridge, CDP listener, or log collector HTTP server). Each source produces a normalized `FrontendError` object.
2. **Redaction**: Secret redaction runs on all `FrontendError` fields before buffer insertion (reuses the existing `SecretRedactor` from Phase 1).
3. **Buffering**: Redacted `FrontendError`s enter the frontend ring buffer (max 200, TTL 5 minutes).
4. **Correlation**: When `get_correlated_errors` is called, the `CorrelationEngine` reads both buffers, runs the matching algorithm, scores each pair, and returns results.

### Source Priority (Fallback Chain)

```
ViewGraph available? ──yes──▶ Use ViewGraph bridge
        │ no
        ▼
CDP configured + connected? ──yes──▶ Use CDP listener
        │ no
        ▼
Log collector enabled? ──yes──▶ Accept HTTP pushes
        │ no
        ▼
correlation_source = "none" (get_correlated_errors returns [])
```

The `FrontendErrorSourceManager` manages this fallback chain. It probes ViewGraph on startup and periodically (every 30 seconds). Source transitions are logged to stderr.

---

## Data Model

### FrontendError Interface

```typescript
/**
 * Normalized representation of a browser-side HTTP failure.
 *
 * Produced by any of the three frontend data sources (ViewGraph, CDP, log collector).
 * Stored in the frontend error ring buffer for correlation with backend RuntimeEvents.
 */
interface FrontendError {
  /** Unique identifier for this frontend error. */
  readonly id: string;

  /** Unix timestamp in milliseconds when the browser observed the failure. */
  readonly timestamp: number;

  /** Full request URL as seen by the browser. */
  readonly url: string;

  /** URL path component only (no host, port, query, fragment). Used for correlation matching. */
  readonly path: string;

  /** HTTP method (GET, POST, PUT, DELETE, etc.). */
  readonly method: string;

  /** HTTP response status code (4xx or 5xx). */
  readonly statusCode: number;

  /** HTTP status text (e.g., "Internal Server Error"). */
  readonly statusText: string;

  /** Selected response headers - only trace-related and content-type. */
  readonly responseHeaders: Readonly<Record<string, string>>;

  /** Extracted W3C trace ID from traceparent header, if present. 32 hex chars. */
  readonly traceId?: string;

  /** Extracted Datadog trace ID from x-datadog-trace-id header, if present. */
  readonly datadogTraceId?: string;

  /** Which source produced this error. */
  readonly source: "viewgraph" | "cdp" | "log-collector";

  /** Response body snippet (first 500 chars), if available. Secret-redacted. */
  readonly responseBodySnippet?: string;

  /** Request duration in milliseconds, if available. */
  readonly durationMs?: number;
}
```

### CorrelatedError (MCP Tool Response)

```typescript
/**
 * A matched pair of frontend HTTP failure and backend error,
 * returned by the get_correlated_errors MCP tool.
 */
interface CorrelatedError {
  /** The browser-side HTTP failure. */
  readonly frontend_error: FrontendError;

  /** The matching server-side error from the backend event buffer. */
  readonly backend_error: RuntimeEvent;

  /** Confidence score (0–1) indicating match quality. See correlation algorithm. */
  readonly correlation_confidence: number;

  /** How the match was made - trace ID is definitive, URL+time is heuristic. */
  readonly match_method: "trace-id" | "url-timestamp";
}
```

### Extended RuntimeStatus (Phase 4 additions)

```typescript
/**
 * Phase 4 extends the existing RuntimeStatus with correlation source info.
 */
interface RuntimeStatus {
  // ... existing Phase 1-3 fields ...

  /** Which frontend data source is currently active. */
  readonly correlation_source: "viewgraph" | "cdp" | "log-collector" | "none";

  /** Number of frontend errors currently in the buffer. */
  readonly frontend_error_count: number;
}
```

---

## Component Design

### 1. FrontendErrorBuffer (`src/correlation/frontend-error-buffer.ts`)

A ring buffer identical in design to the existing backend event buffer, but sized for frontend errors.

- **Max size**: 200 entries (constant: `FRONTEND_BUFFER_MAX_SIZE`)
- **TTL**: 5 minutes (constant: `FRONTEND_ERROR_TTL_MS = 300_000`)
- **Eviction**: oldest-first on insert when full; TTL-expired entries cleaned on each insert
- **Thread safety**: single-threaded (Node.js), no locking needed
- **API**: `push(error: FrontendError)`, `getAll()`, `getByUrl(url: string)`, `clear()`, `size()`

### 2. FrontendErrorSourceManager (`src/correlation/source-manager.ts`)

Manages the fallback chain of frontend error data sources. Owns the lifecycle of each source adapter.

```typescript
/**
 * Manages frontend error data sources with automatic fallback.
 *
 * Priority: ViewGraph > CDP > Log Collector > None.
 * Probes ViewGraph availability on startup and every 30 seconds.
 * Source transitions are logged to stderr.
 */
interface FrontendErrorSourceManager {
  /** Start all configured sources. Returns the active source type. */
  start(config: CorrelationConfig): Promise<CorrelationSourceType>;

  /** Stop all sources and clean up connections. */
  stop(): Promise<void>;

  /** Current active source. */
  readonly activeSource: CorrelationSourceType;

  /** Register a callback for incoming frontend errors (from any source). */
  onError(callback: (error: FrontendError) => void): void;
}
```

### 3. CDP Listener (`src/correlation/sources/cdp-listener.ts`)

Connects to Chrome via Puppeteer's CDP client (not full Puppeteer - just the `chrome-remote-interface` style connection) to capture network response events.

**CDP Events Used:**
- `Network.responseReceived` - capture status code, URL, headers
- `Network.loadingFailed` - capture failed requests (DNS, connection refused)

**Connection Management:**
- Connects to `ws://localhost:9222` (configurable via `--cdp-url`)
- Reconnects with exponential backoff (1s, 2s, 4s, max 30s) on disconnect
- Max 3 reconnect attempts before giving up and falling back to next source
- Emits `FrontendError` for every 4xx/5xx response

**Dependency:** Uses `chrome-remote-interface` npm package (lightweight CDP client, no Puppeteer needed). This avoids pulling in the full Puppeteer dependency (~400MB) when only the CDP protocol client is needed.

### 4. ViewGraph Bridge (`src/correlation/sources/viewgraph-bridge.ts`)

Polls ViewGraph's MCP server for network failure data. ViewGraph already captures network requests as part of its page context - this bridge extracts the failure subset.

**Integration Approach:**
- HTTP polling to ViewGraph's API endpoint (default `http://localhost:9700`)
- Polls every 2 seconds for new network failures
- Transforms ViewGraph's network data format into `FrontendError`
- Falls back to CDP if ViewGraph becomes unreachable (3 consecutive failed polls)

**Why polling, not MCP tool calls:**
ViewGraph exposes network data via its own MCP tools, but TracePulse can't call MCP tools on another MCP server through the agent. Instead, ViewGraph exposes a lightweight HTTP API for tool-to-tool communication. If ViewGraph doesn't have this API yet, the bridge starts in "unavailable" mode and falls through to CDP.

### 5. Log Collector HTTP Server (`src/correlation/sources/log-collector.ts`)

A minimal HTTP server that accepts frontend error reports pushed by browser extensions or custom scripts.

**Endpoints:**
- `POST /api/v1/errors` - accept a `FrontendError` payload
- `GET /api/v1/health` - health check (returns `{ status: "ok" }`)

**Server Details:**
- Uses Node.js built-in `node:http` module (no Express, no framework)
- Binds to `127.0.0.1:9801` (configurable port)
- Disabled by default - enabled via `--enable-collector`
- Content-Type validation: rejects non-`application/json`
- Payload validation: checks required fields, rejects malformed with 400
- Rate limiting: token bucket, 100 req/s, returns 429 when exceeded
- Max request body: 64KB

**Request Schema:**
```json
{
  "url": "http://localhost:3000/api/users",
  "method": "GET",
  "statusCode": 500,
  "statusText": "Internal Server Error",
  "timestamp": 1714234567890,
  "responseHeaders": { "traceparent": "00-abc123...-01" },
  "responseBodySnippet": "Error: connection refused",
  "durationMs": 234
}
```

### 6. Trace ID Extractor (`src/correlation/trace-id-extractor.ts`)

Pure function module that extracts trace IDs from HTTP response headers.

```typescript
/**
 * Extract trace IDs from HTTP response headers.
 *
 * Supports W3C traceparent and Datadog x-datadog-trace-id headers.
 * traceparent takes precedence when both are present.
 *
 * @see https://www.w3.org/TR/trace-context/ for traceparent spec
 */
interface TraceIds {
  readonly traceId?: string;        // From traceparent (32 hex chars)
  readonly datadogTraceId?: string;  // From x-datadog-trace-id (as-is)
}

function extractTraceIds(headers: Record<string, string>): TraceIds;
```

**traceparent format:** `{version}-{trace-id}-{parent-id}-{trace-flags}`
- Version: 2 hex chars (must be "00")
- Trace ID: 32 hex chars - this is what we extract
- Parent ID: 16 hex chars
- Trace flags: 2 hex chars

### 7. CorrelationEngine (`src/correlation/correlation-engine.ts`)

The core matching algorithm. Stateless - reads from both buffers on each call.

```typescript
/**
 * Matches frontend HTTP failures with backend RuntimeEvents.
 *
 * Correlation strategy (in priority order):
 * 1. Trace ID match - if both sides have the same trace ID, confidence = 1.0
 * 2. URL path + timestamp proximity - heuristic matching with scored confidence
 *
 * The engine is stateless: it reads both buffers on each invocation.
 * No pre-computed indexes - buffer sizes (500 + 200) make brute-force fast enough.
 */
interface CorrelationEngine {
  correlate(options?: { url?: string }): CorrelatedError[];
}
```

**Correlation Algorithm:**

```
For each FrontendError in the frontend buffer:
  1. TRACE ID MATCH: If FrontendError.traceId exists:
     - Search backend buffer for RuntimeEvent where context.trace_id === FrontendError.traceId
     - If found: emit pair with confidence = 1.0, match_method = "trace-id"
     - Continue to next FrontendError (trace ID match is definitive)

  2. URL + TIMESTAMP MATCH: Find backend errors within ±2 seconds:
     - Filter backend buffer: |backend.timestamp - frontend.timestamp| <= 2000ms
     - For each candidate, compute path similarity:
       a. Extract path from backend error context (file, URL in message, or raw log)
       b. Compare with frontend.path
     - Score each candidate:
       - Exact path match + Δt < 500ms  → 0.9
       - Exact path match + Δt < 2000ms → 0.7
       - Partial path match + Δt < 500ms  → 0.6
       - Partial path match + Δt < 2000ms → 0.4
     - Select the candidate with the highest score
     - If score > 0: emit pair with that confidence, match_method = "url-timestamp"

  3. If URL filter is provided, pre-filter frontend buffer before step 1.

Sort results by timestamp descending.
```

**Path Extraction from Backend Errors:**
Backend `RuntimeEvent`s don't always contain the request URL directly. The engine checks (in order):
1. `context.url` field (if the error parser extracted it)
2. URL pattern in `message` (regex: `(GET|POST|PUT|DELETE|PATCH)\s+(/[^\s]+)`)
3. URL pattern in `raw` log line

**Partial Path Match:**
A partial match means one path is a prefix of the other, or they share a common path prefix of at least 2 segments. Example: `/api/users` partially matches `/api/users/123`.

---

## MCP Tool Contract

### get_correlated_errors

```json
{
  "name": "get_correlated_errors",
  "description": "Show frontend HTTP failures (4xx/5xx) correlated with backend server errors. Returns both sides of a failed request with a confidence score. Requires a frontend data source (ViewGraph, CDP, or log collector) to be active.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "Optional URL filter. Only correlations where the frontend request URL contains this string are returned. Case-insensitive partial match."
      }
    }
  }
}
```

**Response Example:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "[{\"frontend_error\":{\"id\":\"fe-abc123\",\"timestamp\":1714234567890,\"url\":\"http://localhost:3000/api/users\",\"path\":\"/api/users\",\"method\":\"GET\",\"statusCode\":500,\"statusText\":\"Internal Server Error\",\"responseHeaders\":{},\"source\":\"cdp\"},\"backend_error\":{\"id\":\"be-def456\",\"timestamp\":1714234567650,\"source\":\"server-stderr\",\"service\":\"main\",\"level\":\"error\",\"message\":\"TypeError: Cannot read property 'id' of undefined\",\"stack_trace\":\"at getUser (src/routes/users.ts:42)\\n...\",\"fingerprint\":\"abc123\",\"signal_score\":75,\"signal_strength\":\"high\",\"context\":{\"file\":\"src/routes/users.ts\",\"line\":42,\"error_type\":\"TypeError\"},\"raw\":\"TypeError: Cannot read property...\",\"first_seen\":1714234567650,\"occurrence_count\":1},\"correlation_confidence\":0.9,\"match_method\":\"url-timestamp\"}]"
    }
  ]
}
```

### get_runtime_status (Extended)

Phase 4 adds two fields to the existing response:
- `correlation_source`: `"viewgraph"` | `"cdp"` | `"log-collector"` | `"none"`
- `frontend_error_count`: number of frontend errors currently buffered

---

## Configuration

### CLI Flags (Phase 4 additions)

| Flag | Default | Description |
|---|---|---|
| `--cdp-url <url>` | (none) | WebSocket URL for Chrome CDP connection. Enables CDP listener. |
| `--viewgraph-url <url>` | `http://localhost:9700` | ViewGraph MCP server URL for network failure data. |
| `--enable-collector` | `false` | Enable the log collector HTTP server. |
| `--collector-port <port>` | `9801` | Port for the log collector HTTP server. |
| `--no-viewgraph` | `false` | Disable ViewGraph auto-detection even if available. |
| `--correlation-window <ms>` | `2000` | Timestamp proximity window for URL-based correlation (milliseconds). |

### Constants (`src/constants/correlation.ts`)

```typescript
/** Maximum number of frontend errors stored in the ring buffer. */
export const FRONTEND_BUFFER_MAX_SIZE = 200;

/** Time-to-live for frontend errors in milliseconds (5 minutes). */
export const FRONTEND_ERROR_TTL_MS = 300_000;

/** Default timestamp proximity window for correlation matching (±2 seconds). */
export const CORRELATION_WINDOW_MS = 2_000;

/** High-confidence timestamp threshold (milliseconds). */
export const HIGH_CONFIDENCE_WINDOW_MS = 500;

/** ViewGraph health check interval in milliseconds. */
export const VIEWGRAPH_PROBE_INTERVAL_MS = 30_000;

/** Maximum consecutive ViewGraph poll failures before fallback. */
export const VIEWGRAPH_MAX_FAILURES = 3;

/** ViewGraph polling interval for new network failures (milliseconds). */
export const VIEWGRAPH_POLL_INTERVAL_MS = 2_000;

/** CDP reconnect backoff: initial delay (milliseconds). */
export const CDP_RECONNECT_INITIAL_MS = 1_000;

/** CDP reconnect backoff: maximum delay (milliseconds). */
export const CDP_RECONNECT_MAX_MS = 30_000;

/** CDP maximum reconnect attempts before giving up. */
export const CDP_MAX_RECONNECT_ATTEMPTS = 3;

/** Log collector: maximum request body size in bytes (64KB). */
export const COLLECTOR_MAX_BODY_BYTES = 65_536;

/** Log collector: rate limit (requests per second). */
export const COLLECTOR_RATE_LIMIT_RPS = 100;

/** Log collector: default port. */
export const COLLECTOR_DEFAULT_PORT = 9801;

/** Default ViewGraph URL. */
export const VIEWGRAPH_DEFAULT_URL = "http://localhost:9700";

/** Confidence scores for each match tier. */
export const CONFIDENCE_TRACE_ID = 1.0;
export const CONFIDENCE_EXACT_PATH_CLOSE = 0.9;
export const CONFIDENCE_EXACT_PATH_FAR = 0.7;
export const CONFIDENCE_PARTIAL_PATH_CLOSE = 0.6;
export const CONFIDENCE_PARTIAL_PATH_FAR = 0.4;
```

---

## File Structure (Phase 4 additions)

```
src/
├── correlation/
│   ├── index.ts                      # Public API: re-exports CorrelationEngine, types
│   ├── correlation-engine.ts         # Core matching algorithm
│   ├── frontend-error-buffer.ts      # Ring buffer for FrontendError objects
│   ├── source-manager.ts             # Fallback chain manager for data sources
│   ├── trace-id-extractor.ts         # Pure function: extract trace IDs from headers
│   ├── types.ts                      # FrontendError, CorrelatedError, config interfaces
│   └── sources/
│       ├── cdp-listener.ts           # Chrome DevTools Protocol network listener
│       ├── viewgraph-bridge.ts       # ViewGraph MCP server polling bridge
│       └── log-collector.ts          # HTTP server for browser-pushed errors
├── constants/
│   └── correlation.ts                # All Phase 4 constants
└── tools/
    └── get-correlated-errors.ts      # MCP tool handler (pure function)

tests/
├── unit/
│   └── correlation/
│       ├── test-correlation-engine.test.ts
│       ├── test-frontend-error-buffer.test.ts
│       ├── test-trace-id-extractor.test.ts
│       ├── test-source-manager.test.ts
│       └── sources/
│           ├── test-cdp-listener.test.ts
│           ├── test-viewgraph-bridge.test.ts
│           └── test-log-collector.test.ts
└── integration/
    └── test-correlation-flow.test.ts
```

---

## Dependency Analysis

### New Dependencies

| Package | Purpose | Justification |
|---|---|---|
| `chrome-remote-interface` | Lightweight CDP client | Connects to Chrome's debugging protocol without pulling in full Puppeteer (~400MB). Well-maintained (1.2k★), focused on CDP only. |

### Existing Dependencies Used

| Package | Usage in Phase 4 |
|---|---|
| `node:http` | Log collector HTTP server (built-in, no external dep) |
| `node:url` | URL parsing for path extraction (built-in) |
| `@modelcontextprotocol/sdk` | MCP tool registration for `get_correlated_errors` |

### Dependencies NOT Added (and why)

| Package | Why Not |
|---|---|
| `puppeteer` | Only need CDP protocol client, not browser automation. `chrome-remote-interface` is 100x lighter. |
| `express` / `fastify` | Log collector is a single-endpoint server. `node:http` is sufficient. |
| `ws` | `chrome-remote-interface` handles WebSocket internally. |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| CDP connection refused | Log warning to stderr. Set `correlation_source = "none"`. All non-correlation tools work normally. |
| CDP disconnects mid-session | Log warning. Attempt reconnect with exponential backoff (3 attempts). If all fail, fall back to next source. |
| ViewGraph unreachable on startup | Skip ViewGraph, try CDP. Log info to stderr. |
| ViewGraph becomes unreachable mid-session | After 3 consecutive failed polls, fall back to CDP (if configured) or none. Log warning. |
| Log collector receives malformed JSON | Return 400 with `{ error: "Invalid JSON", details: "<parse error>" }`. Do not crash. |
| Log collector receives oversized body | Return 413 with `{ error: "Payload too large", max_bytes: 65536 }`. |
| Log collector rate limit exceeded | Return 429 with `{ error: "Rate limit exceeded", retry_after_ms: <computed> }`. |
| `get_correlated_errors` called with no frontend source | Return empty array. No error - this is expected when correlation is not configured. |
| traceparent header malformed | Silently ignore. Fall back to URL+timestamp correlation. Log debug-level message. |

---

## Graceful Shutdown (Phase 4 additions)

When TracePulse receives SIGINT/SIGTERM:
1. Stop the log collector HTTP server (close listening socket, drain in-flight requests with 5s timeout).
2. Disconnect CDP client (close WebSocket).
3. Stop ViewGraph polling.
4. Existing shutdown sequence continues (forward signal to child process, etc.).
