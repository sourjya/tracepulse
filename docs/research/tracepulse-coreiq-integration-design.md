# TracePulse-CoreIQ Integration Design

## How TracePulse fits into CoreIQ

CoreIQ's architecture (ADR-003) is "observe, never store." Tools self-register via manifest POST, CoreIQ pulls data on demand. TracePulse fits this pattern exactly:

1. **TracePulse registers its manifest** with CoreIQ on startup
2. **CoreIQ's dashboard** shows TracePulse as a tool with health status
3. **CoreIQ's health poller** checks TracePulse's HTTP endpoint
4. **Agents** call TracePulse tools via MCP (already works)
5. **CoreIQ proxies** TracePulse data to the dashboard on demand

No bridge repo needed. No fork needed. No new infrastructure.

## Where the code lives

```
tracepulse (public repo, npm, AGPL-3.0)
  └── Already has --http transport on port 9800
  └── Already has get_project_health, get_session_summary, etc.
  └── Needs: manifest registration on startup (tiny addition)

coreiq (private repo)
  └── Already has manifest registry (POST /api/v1/manifests)
  └── Already has health poller (checks HTTP endpoints)
  └── Already has tool health dashboard view
  └── Needs: TracePulse widget in dashboard (reads from TP's HTTP API)
```

## Implementation

### Step 1: TracePulse registers with CoreIQ (in tracepulse repo)

When TracePulse starts with `--http` and detects CoreIQ is running, it POSTs its manifest:

```json
POST http://localhost:7200/api/v1/manifests
{
  "tool_name": "tracepulse",
  "display_name": "TracePulse",
  "base_url": "http://localhost:9800",
  "version": "0.9.14",
  "manifest": {
    "description": "Runtime feedback MCP server for AI coding agents",
    "widgets": [
      {
        "id": "tp-health",
        "title": "Agent Error Monitor",
        "data_source": "/health",
        "refresh_interval": 30
      },
      {
        "id": "tp-session",
        "title": "Session Summary",
        "data_source": "/session",
        "refresh_interval": 60
      },
      {
        "id": "tp-patterns",
        "title": "Bug Patterns",
        "data_source": "/patterns",
        "refresh_interval": 300
      }
    ],
    "health_endpoint": "/health",
    "mcp_tools": 39
  }
}
```

This is a ~20 line addition to TracePulse's HTTP transport startup. It's a standard HTTP POST - no CoreIQ-specific code in the public repo.

### Step 2: TracePulse exposes HTTP data endpoints (in tracepulse repo)

The `--http` transport already exists on port 9800 for MCP Streamable HTTP. Add simple REST endpoints alongside it:

```
GET /health     → { status: "ok", errors: 3, uptime_min: 42 }
GET /session    → same as get_session_summary() output
GET /patterns   → same as get_bug_patterns() output
GET /metrics    → { tools: 39, parsers: 26, tests: 968, session_errors: 5 }
```

These are thin wrappers around existing tool handlers. ~50 lines total.

### Step 3: CoreIQ health poller picks it up (in coreiq repo)

CoreIQ's existing health poller (ADR-002) already polls registered tools. Once TracePulse registers its manifest with `health_endpoint: "/health"`, the poller starts checking it automatically. No CoreIQ code changes needed.

### Step 4: CoreIQ dashboard widget (in coreiq repo)

The React dashboard (M9) renders widgets from manifests. A TracePulse widget would show:
- Error count (from /health)
- Session duration
- Bug patterns detected
- Token savings

This is a CoreIQ frontend task, not a TracePulse task.

## What stays in each repo

| Concern | Repo | Why |
|---------|------|-----|
| Manifest registration on startup | tracepulse | Standard HTTP POST, no CoreIQ-specific code |
| REST data endpoints (/health, /session) | tracepulse | Thin wrappers around existing handlers |
| Health polling | coreiq | Already exists, auto-discovers from manifest |
| Dashboard widget | coreiq | CoreIQ's UI concern |
| MCP tools (39 tools) | tracepulse | Unchanged |

## Docker integration

When the shared infra stack (~/infra/docker-compose.yml) is set up:

```yaml
# In ~/infra/docker-compose.yml (or a separate dev-tools compose)
services:
  tracepulse:
    image: node:22-alpine
    command: tracepulse --http
    ports:
      - "9800:9800"
    volumes:
      - ${PROJECT_DIR}:/workspace
    working_dir: /workspace
    environment:
      - COREIQ_URL=http://coreiq:7200  # For manifest registration
```

TracePulse detects `COREIQ_URL` env var and auto-registers on startup. No config file needed.

## Live reporting

CoreIQ's planned M11 (SSE Real-Time Events) will enable live updates:

1. TracePulse POSTs events to CoreIQ's event endpoint when errors occur
2. CoreIQ pushes them to the dashboard via SSE
3. Dashboard shows real-time error feed from all agent sessions

This aligns with CoreIQ's Phase 2 plan: "In-process event queue (MCP -> SSE, <100ms latency)."

## What NOT to do

- Don't fork TracePulse - CoreIQ consumes it via HTTP, not source code
- Don't store TracePulse data in CoreIQ's DB (ADR-003: observe, never store)
- Don't add CoreIQ-specific logic to TracePulse's public code
- Don't create a bridge repo - the manifest pattern handles everything
