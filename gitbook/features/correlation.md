# Frontend-Backend Correlation

Match browser HTTP failures with backend stack traces.

## How It Works

`get_correlated_errors(url?)` reads from both the backend event buffer and the frontend error buffer, matching pairs by:

1. **Trace ID** (confidence 1.0) - W3C traceparent or Datadog trace ID
2. **URL path + timestamp** (confidence 0.7-0.9) - same path within 2 seconds

## Setup

Frontend errors need a source. Options:
- Log collector HTTP server on port 9801
- CDP listener (Chrome DevTools Protocol)
- [ViewGraph](https://chaoslabz.gitbook.io/viewgraph) bridge

## Without Frontend Source

If no frontend source is configured, `get_correlated_errors` returns an empty array with a helpful message. Use Chrome DevTools MCP `list_network_requests` as an alternative.
