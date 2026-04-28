# Agent Wishlist - Accumulated

All feature requests from AI agents using TracePulse, with current status and scope assessment.

Last updated: 2026-04-28 (session 3)

| # | Wish | Why | Status | Scope |
|---|------|-----|--------|-------|
| 1 | `clear_errors(fingerprint=...)` | Clear specific error types, not everything | 🔲 Build | TracePulse |
| 2 | `watch_for_errors` request summary | `requests_seen: 15, all_2xx: true` to confirm window was meaningful | 🔲 Build | TracePulse |
| 3 | `get_health_summary` one-liner | "0 errors, 47 req/min, avg 23ms" instead of 3 tool calls | 🔲 Build | TracePulse |
| 4 | Build module count / bundle size delta | `"modules": 910, "delta": +2` on `get_build_errors` | 🔲 Build | TracePulse |
| 5 | Browser-side error capture | Failed fetch(), console errors | ⬜ Not TP | Chrome DevTools MCP |
| 6 | Structured error payloads | Include response body on 4xx/5xx | ⬜ Not TP | Chrome DevTools MCP |
| 7 | HMR detection for Vite | Parse reload events from Vite stdout | ✅ uvicorn shipped v0.6.1 | Needs multi-file attach |
| 8 | Request/response pairing | "Last 5 requests to /export" with status + timing + body | 🔲 Roadmap | TracePulse |
| 9 | `since` filter on `get_errors` | Exclude stale errors from before a fix | ✅ Already exists | `since` param + `last_event_timestamp` |
| 10 | `get_server_logs(url_filter=...)` | Filter by URL path substring | ✅ Shipped v0.7.0 | `message_contains` param |

## Previously shipped (from earlier sessions)

| Feature | Shipped in | Agent request |
|---------|-----------|---------------|
| `status_code_min` filter | v0.7.0 | "Filter to just 4xx/5xx" |
| `message_contains` filter | v0.6.1 | "Filter by URL path" |
| Freshness metadata (`session_started_at`, `oldest_event_at`) | v0.6.1 | "Is this data fresh or stale?" (asked 3x) |
| `last_event_timestamp` cursor | v0.7.0 | "Since last check" |
| uvicorn/Django/Flask reload patterns | v0.6.1 | "Detect uvicorn reload" |
| Structlog key-value parser | v0.6.1 | "All events show as level: info" |
| HTTP access log parser | v0.7.0 | "Parse uvicorn/express access logs" |

## Priority: build next

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | Selective clear by fingerprint | 15 min | Reduces noise without losing real errors |
| 2 | Watch request summary | 20 min | Solves "was the watch meaningful?" trust gap |
| 3 | Health summary tool | 20 min | 3 tool calls -> 1 for most common check |
| 4 | Bundle size delta | 15 min | Parse existing Vite/webpack output |

## Not building (use companion tools)

| # | Feature | Use instead |
|---|---------|-------------|
| 5 | Browser error capture | Chrome DevTools MCP: `list_console_messages`, `list_network_requests` |
| 6 | Response bodies | Chrome DevTools MCP: `get_network_request` |
