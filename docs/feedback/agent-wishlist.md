# Agent Wishlist - Accumulated

All feature requests from AI agents using TracePulse, with current status and scope assessment.

Last updated: 2026-04-28

| # | Wish | Why | Status | Scope |
|---|------|-----|--------|-------|
| 1 | `status_code_min` filter on `get_server_logs` | Filter to just 4xx/5xx without scanning 200s | ✅ Shipped v0.7.0 | TracePulse |
| 2 | `since` timestamp on `get_errors` | Exclude stale errors from before a fix | ✅ Already exists (`since` param + `last_event_timestamp` in response) | TracePulse |
| 3 | `clear_errors(fingerprint=...)` | Clear specific error types, not everything | 🔲 New - selective clear by fingerprint | TracePulse |
| 4 | `watch_for_errors` request summary | Show `requests_seen: 15, all_2xx: true` to confirm window was meaningful | 🔲 New - count events seen during watch, not just errors | TracePulse |
| 5 | `get_health_summary` tool | One-line: "0 errors, 47 req/min, avg 23ms" instead of 3 tool calls | 🔲 New - composite tool combining status + error count + request rate | TracePulse |
| 6 | Build module count / bundle size delta | `"modules": 910, "delta": +2` on `get_build_errors` | 🔲 Parse Vite/webpack build stats from stdout | TracePulse |
| 7 | Browser-side error capture | Failed fetch(), console errors - export bug was invisible | ⬜ Chrome DevTools MCP scope | Not TracePulse |
| 8 | Structured error payloads | Include response body on 4xx/5xx, not just status line | ⬜ Chrome DevTools MCP `get_network_request` | Not TracePulse |
| 9 | HMR detection for Vite | Parse "WatchFiles detected changes" from uvicorn stdout | ✅ uvicorn patterns shipped v0.6.1. Vite needs multi-file attach. | TracePulse |
| 10 | Request/response pairing | "Last 5 requests to /export" with status + timing + body | 🔲 Roadmap - request tracking buffer | TracePulse |

## Priority Assessment

### Build now (high impact, low effort)

| # | Feature | Effort | Why now |
|---|---------|--------|---------|
| 3 | Selective clear by fingerprint | Low | Agent wants to clear known noise without losing real errors |
| 4 | Watch request summary | Low | Solves "was the watch window meaningful?" trust issue |
| 5 | Health summary tool | Low | Reduces 3 tool calls to 1 for the most common check |

### Build soon (medium impact)

| # | Feature | Effort | Why |
|---|---------|--------|-----|
| 6 | Bundle size delta | Low | Parse existing Vite output, nice DX |
| 10 | Request tracking buffer | Medium | New data model, high value for API debugging |

### Not building (out of scope)

| # | Feature | Use instead |
|---|---------|-------------|
| 7 | Browser error capture | Chrome DevTools MCP `list_console_messages`, `list_network_requests` |
| 8 | Response bodies | Chrome DevTools MCP `get_network_request` |
