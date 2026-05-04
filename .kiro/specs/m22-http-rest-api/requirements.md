# M22: HTTP REST API + Dashboard Integration

## Problem

TracePulse has an HTTP transport (`--http` on port 9800) for MCP Streamable HTTP, but no REST endpoints for non-MCP consumers. external dashboard needs to:
1. Poll TracePulse's health status (HTTP health polling: HTTP health polling)
2. Pull session/pattern data for dashboard widgets (the observe-never-store pattern: observe, never store)
3. Discover TracePulse via manifest registration

Without REST endpoints, external dashboard can only reach TracePulse through MCP protocol - which requires a full MCP client. The dashboard and health poller need simple HTTP GET.

## Architecture

### Data flow

```
external dashboard Health Poller                    TracePulse HTTP (port 9800)
  │                                       │
  ├── GET /health (every 30s) ──────────► │ → returns error count, uptime, status
  │                                       │
external dashboard Dashboard                          │
  │                                       │
  ├── GET /api/session ─────────────────► │ → returns session summary
  ├── GET /api/patterns ────────────────► │ → returns bug patterns
  ├── GET /api/metrics ─────────────────► │ → returns tool/parser/test counts
  │                                       │
TracePulse (on startup)                   │
  │                                       │
  ├── POST {DASHBOARD_URL}/api/v1/manifests ► external dashboard → registers as a tool
  │                                       │
AI Agent (MCP client)                     │
  │                                       │
  ├── MCP JSON-RPC (existing) ──────────► │ → 39 tools, unchanged
```

### What changes vs what doesn't

| Component | Changes? | Details |
|-----------|----------|---------|
| MCP tools (39) | No | Unchanged, still available via stdio and HTTP |
| HTTP transport | Extended | Add REST endpoints alongside MCP Streamable HTTP |
| CLI | Extended | Read DASHBOARD_URL env var, register on startup |
| Security | Extended | API key auth on REST endpoints |
| Public API | No | REST endpoints are optional, off by default |

## Design Decisions

### D1: REST endpoints are only available with `--http`

REST endpoints only exist when the HTTP transport is active. In stdio-only mode (the default), there's no HTTP server, so no REST endpoints. This means:
- Zero-config users are unaffected
- No new attack surface unless explicitly enabled
- external dashboard integration requires `--http` flag

### D2: API key authentication

REST endpoints require `X-API-Key` header when `TRACEPULSE_API_KEY` env var is set. If the env var is not set, endpoints are open (localhost-only, same as today).

This matches external dashboard's auth pattern (standard API key auth).

```
TRACEPULSE_API_KEY not set → endpoints open (dev mode, localhost only)
TRACEPULSE_API_KEY set     → X-API-Key header required on all REST calls
```

### D3: Manifest registration is opt-in via DASHBOARD_URL

TracePulse only registers with external dashboard when `DASHBOARD_URL` env var is set. No external dashboard-specific code runs otherwise. The public npm package has zero external dashboard awareness unless you set the env var.

```
DASHBOARD_URL not set → no registration, no external dashboard awareness
DASHBOARD_URL set     → POST manifest on startup, re-register every 5 min
```

### D4: REST responses mirror MCP tool output

REST endpoints return the same JSON as the corresponding MCP tools. No separate data format to maintain.

| REST endpoint | MCP tool equivalent | Response |
|--------------|-------------------|----------|
| GET /health | get_health_summary | `{ errors: 3, warnings: 1, uptime_min: 42 }` |
| GET /api/session | get_session_summary | Session manifest (~200 tokens) |
| GET /api/patterns | get_bug_patterns | Pattern analysis with costs |
| GET /api/metrics | get_project_health | Stacks, layers, tool count |
| GET /api/errors | get_errors (limit 10) | Top 10 errors by signal score |

### D5: No data storage in external dashboard

Per the observe-never-store pattern, external dashboard never stores TracePulse data. It pulls on demand:
- Health poller stores its own observations (poll result, latency) - not TracePulse's data
- Dashboard fetches from TracePulse's REST endpoints on each render
- If TracePulse is down, external dashboard shows "unreachable" - not stale data

## Security Model

### Alignment with external dashboard MCP Security Design

external dashboard's MCP security design (docs/ideas/mcp-security-design.md) establishes platform-wide security patterns. TracePulse adopts the relevant ones:

| external dashboard Pattern | TracePulse Adoption | Notes |
|---------------|-------------------|-------|
| Ephemeral tokens (SR-1, SR-2) | Not needed | TracePulse is a tool, not a multi-tenant server. API key is sufficient for tool-to-tool auth. |
| Client identity (SR-3) | Adopted | REST requests include client identity via X-API-Key. Each key maps to a known consumer. |
| Permission enforcement (SR-4) | Simplified | REST endpoints are read-only (GET only). No write scoping needed. MCP tools have their own annotations. |
| Audit trail (SR-5) | Already exists | TracePulse's `get_audit_trail` logs every MCP tool call with tool, params, duration, response size. Extend to REST calls. |
| Rate limiting (SR-6) | Adopted | Per-client rate limits on REST endpoints. 60 req/min default. |
| Generic errors (SR-7) | Adopted | Auth failures return 401 with no details. No stack traces in responses. |

### What TracePulse does NOT need from external dashboard's design

- **Ephemeral tokens** - TracePulse doesn't spawn subprocesses. It's a single long-running server.
- **Permission YAML** - REST endpoints are all read-only. No tool_filter scoping needed.
- **mcp_audit_log table** - TracePulse uses in-memory audit buffer (no database).

### Threat model for REST endpoints

| Threat | Mitigation |
|--------|-----------|
| External access to error data | HTTP binds to 127.0.0.1 only (existing) |
| Unauthorized local access | X-API-Key when TRACEPULSE_API_KEY is set |
| Secret leakage in responses | Secret redaction runs before all responses (existing) |
| Manifest registration spoofing | external dashboard validates API key on manifest POST (external dashboard's concern) |
| Replay attacks | API keys are static (acceptable for local dev; rotate for team server) |

### Auth flow

```
1. User sets TRACEPULSE_API_KEY=<secret> in MCP config env
2. TracePulse reads it on startup, enables auth middleware
3. external dashboard stores the same key in its tool registry
4. external dashboard's health poller sends X-API-Key on every request
5. TracePulse validates with timing-safe comparison
6. Dashboard requests go through external dashboard's proxy (external dashboard adds the key)
```

For local dev (single developer), API key is optional. For team server (M19), it's required.

## Manifest Schema

```json
{
  "tool_name": "tracepulse",
  "display_name": "TracePulse",
  "base_url": "http://localhost:9800",
  "version": "0.9.14",
  "manifest": {
    "type": "dev-tool",
    "description": "Runtime feedback MCP server for AI coding agents",
    "capabilities": ["error-monitoring", "test-runner", "drift-detection", "bug-patterns"],
    "widgets": [
      {
        "id": "tp-error-feed",
        "title": "Live Error Feed",
        "type": "list",
        "data_source": "/api/errors",
        "refresh_interval_s": 10
      },
      {
        "id": "tp-session",
        "title": "Session Summary",
        "type": "stats",
        "data_source": "/api/session",
        "refresh_interval_s": 60
      },
      {
        "id": "tp-patterns",
        "title": "Bug Patterns",
        "type": "table",
        "data_source": "/api/patterns",
        "refresh_interval_s": 300
      }
    ],
    "health_endpoint": "/health",
    "mcp": {
      "transport": "streamable-http",
      "url": "http://localhost:9800/mcp",
      "tools_count": 39
    }
  }
}
```

## Docker Integration

### Standalone (no Docker)
```bash
DASHBOARD_URL=http://localhost:7200 tracepulse --http start "npm run dev"
```

### In shared infra docker-compose
```yaml
services:
  tracepulse:
    image: node:22-alpine
    command: ["tracepulse", "--http", "start", "npm run dev"]
    ports:
      - "9800:9800"
    volumes:
      - ${PROJECT_DIR}:/workspace
    working_dir: /workspace
    environment:
      DASHBOARD_URL: http://dashboard:7200
      TRACEPULSE_API_KEY: ${TP_API_KEY}
    networks:
      - infra
```

external dashboard discovers TracePulse via manifest registration. No hardcoded URLs in external dashboard's config.

## Tasks

### Phase 1: REST Endpoints (1 day)
- [ ] 1. RED: Tests for /health endpoint
- [ ] 2. GREEN: Implement /health as thin wrapper around get_health_summary handler
- [ ] 3. RED: Tests for /api/session, /api/patterns, /api/metrics, /api/errors
- [ ] 4. GREEN: Implement all REST endpoints
- [ ] 5. Wire into HTTP transport server

### Phase 2: API Key Auth + Rate Limiting (0.5 day)
- [ ] 6. RED: Tests for auth middleware (key present, key missing, key wrong, generic error)
- [ ] 7. GREEN: Implement timing-safe API key middleware
- [ ] 8. RED: Tests for rate limiting (within limit, exceeded, per-client, reset)
- [ ] 9. GREEN: Implement in-memory rate limiter (60 req/min default)
- [ ] 10. Read TRACEPULSE_API_KEY from env, enable middleware when set
- [ ] 11. Extend audit buffer to log REST calls (endpoint, client, status, duration)

### Phase 3: Manifest Registration (0.5 day)
- [ ] 9. RED: Tests for manifest builder (generates correct JSON)
- [ ] 10. GREEN: Implement buildManifest() from current tool/parser counts
- [ ] 11. RED: Tests for registration (POST to DASHBOARD_URL)
- [ ] 12. GREEN: Implement registerWithexternal dashboard() with retry
- [ ] 13. Wire into HTTP transport startup, re-register every 5 min

### Phase 4: Documentation
- [ ] 14. Update README with --http REST endpoints
- [ ] 15. Add external dashboard integration page to gitbook
- [ ] 16. Update installation docs with DASHBOARD_URL env var
- [ ] 17. Update architecture guide with REST API diagram

## Out of Scope

- external dashboard dashboard widget (external dashboard repo task)
- external dashboard health poller config (auto-discovers from manifest)
- SSE push from TracePulse to external dashboard (M18 W2.1, separate milestone)
- Team server auth (M19, separate milestone)
- NATS event bus integration (future, when external dashboard ships M11)
