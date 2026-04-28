# Feature Request Analysis — Agent Session 3

Analysis of 6 feature requests from the Kiro agent during PlanIQ debugging. Each assessed for scope, effort, and architectural fit.

---

## 1. `get_requests(path, limit)` — Request-level querying

**Scope: TracePulse ✅**
**Effort: Medium**
**Impact: HIGH — agent's #1 request**

The agent wants to query by URL path, not just scan logs. This is really two things:

**a) Context-field filtering on existing tools** — Add `message_contains` or `path` filter to `get_errors` and `get_server_logs`. Low effort, uses existing buffer. This alone solves 80% of the need.

**b) A dedicated request-tracking buffer** — Parse HTTP access log lines (`GET /api/users 200 15ms`) into structured request objects with method, path, status, duration. This is a new data model alongside RuntimeEvent. Medium effort but high value.

Recommendation: Do (a) first as a quick win. Consider (b) for post-v1.0.

---

## 2. Structured error payloads (response bodies)

**Scope: NOT TracePulse — Chrome DevTools MCP**
**Effort: N/A**

TracePulse only sees what the server prints to stdout/stderr. The response body `{"detail": "Project not found"}` is sent over HTTP to the browser — it never appears in the server's log output unless the app explicitly logs it.

**The right tool:** Chrome DevTools MCP's `get_network_request(reqid)` captures full response bodies from the browser side.

**What TracePulse COULD do:** If the backend uses a logging middleware that logs response bodies (e.g., FastAPI with a custom middleware), TracePulse would capture it. But that's a backend config change, not a TracePulse feature.

**Recommendation:** Update SKILL.md to direct agent to Chrome DevTools MCP for response bodies. No TracePulse change needed.

---

## 3. `since_last_check` cursor

**Scope: TracePulse ✅**
**Effort: Low**
**Impact: Medium**

The agent calls `get_errors` repeatedly and re-processes old events. Two options:

**a) Server-side cursor** — Track a `last_read_timestamp` per tool call, return only newer events on next call. Adds state to a stateless tool — architecturally messy.

**b) Client-side hint** — The response already includes `session_started_at` and `oldest_event_at`. The agent can pass `since: <timestamp_of_last_call>` to only get newer events. This works TODAY — the agent just needs to be told.

**Recommendation:** Update SKILL.md to teach the agent the pattern: "save the timestamp from your last `get_errors` call, pass it as `since` next time." No code change needed.

---

## 4. Frontend-backend request pairing (auto-populate frontend buffer)

**Scope: TracePulse + Chrome DevTools MCP (integration)**
**Effort: High**
**Impact: HIGH**

`get_correlated_errors` exists but returns empty because nothing feeds the frontend error buffer. The log collector HTTP server exists but nothing sends to it.

**Options:**

**a) Agent-driven:** The agent calls Chrome DevTools MCP `list_network_requests`, filters for 4xx/5xx, and passes them to TracePulse's log collector HTTP endpoint. This works today with no code changes — just a skill/workflow update.

**b) Auto-bridge:** TracePulse connects to Chrome via CDP and auto-captures failed requests. This is the Phase 4 CDP listener that was designed but not fully wired. High effort.

**c) Middleware approach:** A tiny browser script or proxy that POSTs failed requests to TracePulse's log collector on port 9801. Medium effort, fragile.

**Recommendation:** Do (a) first — teach the agent to bridge the data manually. It's 2 tool calls. Consider (b) for post-v1.0.

---

## 5. Health probe

**Scope: TracePulse ✅**
**Effort: Low**
**Impact: Medium**

Periodic HTTP health check against a configurable endpoint. Surface result in `get_runtime_status`:

```json
{
  "connected": true,
  "healthy": true,
  "last_health_check": { "status": 200, "duration_ms": 45, "checked_at": 1714300000000 }
}
```

Architecturally clean — it's a new optional background task that pings an endpoint and stores the result. Doesn't affect the pipeline.

**Recommendation:** Add to post-v1.0 roadmap. Low effort, nice-to-have.

---

## 6. Log-level awareness (structlog parsing)

**Scope: TracePulse ✅ — ALREADY BUILT, possibly broken**
**Effort: Low (investigation)**
**Impact: HIGH**

TracePulse has a JSON log parser (`src/parsers/json-log-parser.ts`) that extracts `level` from structured JSON logs (pino, structlog, logback). If the agent says everything shows as `level: "info"`, either:

**a)** The JSON parser isn't matching the structlog format (maybe the field name is different — structlog uses `level` by default but it's configurable)

**b)** The log lines aren't valid JSON (structlog can output key-value pairs instead of JSON)

**c)** The JSON parser is lower priority than another parser that matches first

**This needs investigation, not new code.** The parser exists — it may just need a fix or the structlog output format needs to be JSON.

**Recommendation:** Investigate the JSON log parser against actual PlanIQ structlog output. Likely a quick fix. This is the highest-ROI item — if log levels work correctly, `get_server_logs(level="warning")` immediately becomes useful.

---

## Priority Summary

| # | Request | Scope | Effort | Impact | Action |
|---|---------|-------|--------|--------|--------|
| 6 | Log-level awareness | TracePulse (investigate) | Low | **HIGH** | Investigate JSON parser vs structlog format |
| 1a | Path/message filtering | TracePulse | Low | **HIGH** | Add `message_contains` filter to tools |
| 3 | Since-last-check | SKILL.md update | None | Medium | Teach agent to use `since` param |
| 4a | FE-BE pairing (manual) | SKILL.md update | None | Medium | Teach agent to bridge data manually |
| 2 | Response bodies | Chrome DevTools MCP | None | Medium | Direct agent to `get_network_request` |
| 5 | Health probe | TracePulse | Low | Medium | Post-v1.0 roadmap |
| 1b | Request tracking buffer | TracePulse | Medium | High | Post-v1.0 roadmap |
| 4b | Auto CDP bridge | TracePulse | High | High | Post-v1.0 roadmap |
