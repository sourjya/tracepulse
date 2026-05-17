# Frontend-Backend Correlation

When a user sees a blank page, the bug could be frontend (JavaScript crash) or backend (API returning 500). Correlation matches the browser-side failure with the backend-side stack trace so the agent sees both halves of the same bug.

## How It Works

`get_correlated_errors(url?)` reads from both the backend event buffer and the frontend error buffer, matching pairs by:

1. **Trace ID** (confidence 1.0) - if your app propagates W3C `traceparent` or Datadog trace IDs, TracePulse matches them automatically
2. **URL path + timestamp** (confidence 0.7-0.9) - same API path within a 2-second window

## Frontend Error Sources

Frontend errors need to reach TracePulse. Three options:

- **ErrorBoundary bridge** - add the TracePulse snippet to your React ErrorBoundary. Frontend crashes POST to `localhost:9801/api/v1/crashes` and appear in [`get_errors`](../features/mcp-tools.md#get_errors) alongside backend errors.
- **Chrome DevTools MCP** - the agent manually bridges by calling `list_network_requests()` in DevTools and `get_errors(message_contains: "/api/path")` in TracePulse.
- **[ViewGraph](https://chaoslabz.gitbook.io/viewgraph)** - captures DOM state including error boundaries.

## Without Frontend Source

If no frontend source is configured, `get_correlated_errors` returns empty with a diagnostic:

```json
{
  "correlations": [],
  "diagnostics": "No correlations found. No frontend error source configured.",
  "suggested_next": [
    "Chrome DevTools MCP: list_network_requests(resourceTypes: ['fetch', 'xhr'])",
    "get_errors(message_contains: '/api/path') - search backend logs"
  ]
}
```

The routing hints guide the agent to the right tool instead of leaving it stuck.

---

## Cross-Layer Diagnosis (DevLoop Agent)

`get_cross_layer_diagnosis(time_window_seconds?)` goes beyond HTTP correlation. It watches **all layers simultaneously** — backend logs, frontend errors, git state, and process state — and produces a single actionable diagnosis.

### When to use it

When the agent is stuck debugging the wrong layer. Common scenarios:

| What you see | What it actually is | DevLoop says |
|---|---|---|
| Backend 200 + frontend error | Auth token expired | "Backend OK but frontend TypeError — check response parsing" |
| 429 errors | Rate limiter full from eval run | "Rate limiter bucket full — wait or reset" |
| Code changed, same error | Server running stale code | "Server hasn't restarted — restart required" |
| Same error 3x in 5 min | Not transient | "Not transient — root cause investigation needed" |

### How it works

1. Collects signals from all layers in a single atomic snapshot
2. Matches signal combinations against 9 known failure patterns
3. Returns diagnoses with confidence scores and proposed fixes
4. Only surfaces diagnoses with 2+ corroborating signals (prevents alert fatigue)

### Example response

```json
{
  "diagnoses": [{
    "pattern_id": "backend-ok-frontend-error",
    "confidence": 85,
    "diagnosis": "Backend returned 200 OK but frontend threw a TypeError...",
    "proposed_fix": "Check the response structure at the frontend call site.",
    "layers_involved": ["backend", "frontend"]
  }],
  "signals_collected": 4,
  "layers_active": ["backend", "frontend", "git"],
  "snapshot_timestamp": "2026-05-17T15:30:00.000Z",
  "missing_signals": []
}
```

