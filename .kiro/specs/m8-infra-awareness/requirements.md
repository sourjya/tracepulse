# M8: Dev Infrastructure Awareness - Requirements & Design

## Overview

Extend TracePulse to detect infrastructure issues from the log stream that already flows through the pipeline. No new data sources needed - just smarter parsing and pattern detection on existing stdout/stderr.

**Principle:** TracePulse already sees everything the dev server prints. These features extract infrastructure signals from that stream and surface them to the agent with appropriate scoring.

---

## Feature 1: Crash Loop Detection

### Problem
When a dev server crashes and restarts repeatedly (e.g., import error on startup), the agent doesn't know it's in a crash loop. It sees individual errors but not the pattern.

### Design

```
Event stream:
  [00:01] Server started
  [00:02] ImportError: No module named 'flask'
  [00:03] Process exited with code 1
  [00:04] Server started          <-- restart #1
  [00:05] ImportError: No module named 'flask'
  [00:06] Process exited with code 1
  [00:07] Server started          <-- restart #2
  ...

Detection:
  Count restart events (hot-reload patterns) within a sliding window.
  If restarts >= 3 in 60 seconds AND errors exist between restarts:
    → Inject synthetic "CRASH LOOP DETECTED" event with signal_score: 95
```

### Implementation
- New module: `src/pipeline/crash-loop-detector.ts`
- Tracks timestamps of hot-reload/restart events
- Sliding window: 3+ restarts in 60s = crash loop
- Synthetic event: `level: "error"`, `signal_score: 95`, `fingerprint: "crashloop:detected"`
- Wired into pipeline after hot-reload detector
- **Effort: Low** (30 min)

### Agent benefit
- `get_errors` surfaces crash loop as highest-priority error
- `get_health_summary` shows "CRASH LOOP: 5 restarts in 30s"
- Agent stops trying to fix individual errors and addresses the root cause

---

## Feature 2: Slow Request Alerting

### Problem
Agent doesn't know when API requests are slow. A 3-second response time is a bug but doesn't generate an error.

### Design

```
HTTP access log line:
  INFO: 127.0.0.1 - "GET /api/export HTTP/1.1" 200  (3.2s)

Detection:
  If parsed duration_ms > SLOW_REQUEST_THRESHOLD_MS (default 1000):
    → Set level to "warn" instead of "info"
    → Add scoring hint: slow_request = true (+10 points)
```

### Implementation
- Update `src/parsers/http-access-log-parser.ts` to extract duration
- Add duration extraction regex for uvicorn (`X.XXs`), express (`XX.XX ms`), nginx (from upstream response time)
- New constant: `SLOW_REQUEST_THRESHOLD_MS = 1000`
- Scoring: slow requests get `level: "warn"` + signal boost
- **Effort: Low** (20 min)

### Agent benefit
- `get_server_logs(level: "warn")` includes slow requests
- `get_errors` surfaces slow requests alongside real errors
- Agent can say "GET /api/export is taking 3.2s - investigate"

---

## Feature 3: Health Endpoint Probing

### Problem
`list_services` shows process is "running" but doesn't mean it's healthy. Server could be deadlocked, out of memory, or stuck.

### Design

```
Background task (every 30s):
  GET http://localhost:{port}/health  (or /api/health, configurable)
  
  If 200: store { status: "healthy", duration_ms: 45, checked_at: ... }
  If non-200 or timeout: store { status: "unhealthy", error: "timeout after 5s" }
  If connection refused: store { status: "unreachable" }

Surfaced in:
  get_runtime_status → last_health_check: { status, duration_ms, checked_at }
  get_health_summary → includes health probe result
```

### Implementation
- New module: `src/infra/health-prober.ts`
- Uses `node:http` to GET a configurable endpoint
- Runs on interval (default 30s, configurable)
- Stores last result in memory
- CLI flag: `--health-url http://localhost:8000/health`
- **Effort: Medium** (1 hour)

### Agent benefit
- `get_runtime_status` shows actual health, not just "process is running"
- Catches deadlocked servers, stuck event loops, DB connection issues
- Agent can say "server is running but health check failed - investigate"

---

## Feature 4: Infrastructure Error Patterns

### Problem
Database connection failures, Redis timeouts, and external API errors appear as generic errors. The agent doesn't recognize them as infrastructure issues.

### Design

New parser or scoring rules that detect infrastructure patterns:

```
Pattern                              | Category        | Signal boost
-------------------------------------|-----------------|-------------
"connection refused"                 | db/connectivity | +20
"too many connections"               | db/pool         | +25
"connection pool exhausted"          | db/pool         | +25
"ECONNREFUSED"                       | connectivity    | +20
"ETIMEDOUT"                          | connectivity    | +15
"MemoryError" / "Cannot allocate"    | memory          | +30
"disk full" / "No space left"        | disk            | +30
"Redis connection" / "WRONGPASS"     | redis           | +20
"SSL" / "certificate"               | tls             | +15
"DNS" / "NXDOMAIN" / "getaddrinfo"  | dns             | +15
```

### Implementation
- New module: `src/scoring/infra-patterns.ts`
- Array of `{ pattern: RegExp, category: string, score_boost: number }`
- Applied in signal scorer as additional scoring hints
- Category stored in `context.infra_category` for filtering
- **Effort: Low** (30 min)

### Agent benefit
- Infrastructure errors score higher than application errors
- `get_errors` surfaces "connection pool exhausted" above "TypeError"
- Agent can filter: `get_errors(message_contains: "connection")` to see all connectivity issues

---

## Feature 5: Database Migration Status

### Problem
Agent runs migrations but can't verify they succeeded without reading logs manually.

### Design

Parse alembic/Django migration output:

```
Alembic patterns:
  "Running upgrade" → info event, context.framework: "alembic"
  "OK" after upgrade → success marker
  "ERROR" / "FAILED" → error event, high signal

Django patterns:
  "Applying migrations" → info event
  "OK" → success marker
  "django.db.utils" → error event
```

### Implementation
- New parser: `src/parsers/migration-parser.ts`
- Matches alembic and Django migration output
- Success events are info-level, failures are error-level with high signal
- **Effort: Low** (20 min)

### Agent benefit
- `get_errors` shows migration failures prominently
- Agent can verify: "migration applied successfully" without reading logs

---

## Feature 6: Environment Validation

### Problem
Missing environment variables cause cryptic errors at runtime. Agent doesn't know which vars are expected.

### Design

```
On startup, if .env.example exists:
  Parse expected variable names from .env.example
  Check which are actually set in process.env
  For each missing var: inject warning event
    "Missing environment variable: DATABASE_URL (defined in .env.example)"
    signal_score: 30, level: "warn"
```

### Implementation
- New module: `src/infra/env-validator.ts`
- Runs once on startup
- Reads `.env.example`, checks `process.env`
- Injects warning events for missing vars
- **Effort: Low** (20 min)

### Agent benefit
- On session start, agent immediately sees "3 missing env vars"
- Catches "why is the DB not connecting?" before the agent wastes time debugging

---

## Priority & Sequencing

| # | Feature | Effort | Impact | Depends on |
|---|---------|--------|--------|------------|
| 1 | Crash loop detection | Low (30 min) | HIGH | Nothing |
| 2 | Slow request alerting | Low (20 min) | HIGH | HTTP access log parser (done) |
| 4 | Infrastructure error patterns | Low (30 min) | HIGH | Nothing |
| 5 | Database migration parser | Low (20 min) | Medium | Nothing |
| 6 | Environment validation | Low (20 min) | Medium | Nothing |
| 3 | Health endpoint probing | Medium (1 hr) | Medium | CLI flag addition |

**Total effort: ~3 hours for all 6 features.**

Items 1, 2, 4 are highest impact and can be built independently. Items 5, 6 are quick wins. Item 3 is the most complex (background task + CLI flag).

---

## Design Patterns Used

**Pattern: Log-based anomaly detection**
Instead of adding new data sources, extract signals from the existing log stream. This is the same pattern used by Datadog Log Analytics and Sentry's log-based error detection. The key insight: the dev server already tells you everything - you just need to listen.

**Pattern: Sliding window counters**
Crash loop detection uses a sliding window (count events in last N seconds). This is the standard pattern from rate limiters and circuit breakers, applied to restart events.

**Pattern: Threshold-based alerting**
Slow request detection uses a configurable threshold. Same pattern as Datadog APM's latency alerts, but applied at dev-time to the access log stream.

**Pattern: Startup validation**
Environment validation runs once on startup, similar to Spring Boot's `EnvironmentPostProcessor` or Django's system checks. Catches configuration issues before they cause runtime errors.
