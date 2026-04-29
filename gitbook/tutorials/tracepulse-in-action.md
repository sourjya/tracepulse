# TracePulse in Action

Real examples from live debugging sessions showing how an AI coding agent uses TracePulse to find and fix bugs faster.

---

## Example 1: Finding a 500 Error in One Call

**The problem:** A user reports "the activity page shows nothing." The agent has no idea what's wrong.

**Without TracePulse:** The agent would need to open the terminal, scroll through dozens of log lines, find the error, copy it, paste it into the chat, then figure out the file and line number. 3-5 minutes.

**With TracePulse:**

The agent calls `get_server_logs` with a filter for the activity endpoint:

```
Agent: get_server_logs(message_contains: "/activity", limit: 5)
```

TracePulse scans the server's log buffer, finds the matching request, and returns:

```json
{
  "message": "GET /api/v1/projects/.../activity 500",
  "signal_score": 75,
  "context": {
    "file": "activity.py",
    "line": 50,
    "http_status": 500,
    "framework": "uvicorn"
  }
}
```

The agent immediately knows: `activity.py`, line 50, HTTP 500. It opens the file, reads the code, and sees the bug - an ORM object being used as a dictionary. Fix applied in under a minute.

**What happened behind the scenes:**
1. The dev server printed the error to stderr
2. TracePulse stripped ANSI colors, redacted any secrets
3. The HTTP access log parser extracted the method, path, and status code
4. The signal scorer gave it 75/100 (server error + user code)
5. The agent's `message_contains: "/activity"` filter found it instantly

---

## Example 2: Catching 25 Migration Errors Nobody Knew About

**The problem:** The agent added new database columns (`auth_provider`, `deleted_at`) but forgot to run migrations. The code references columns that don't exist in the database yet.

**Without TracePulse:** These errors only appear at runtime when a query hits the database. The agent would see cryptic "column does not exist" errors in the terminal - if it was looking. Usually it isn't.

**With TracePulse:**

The agent calls `get_new_errors` to check for anything unusual:

```
Agent: get_new_errors(limit: 5)
```

TracePulse returns two errors it has never seen before:

```json
{
  "errors": [
    {
      "message": "column users.auth_provider does not exist",
      "occurrence_count": 25,
      "signal_score": 95,
      "context": { "error_type": "ProgrammingError" }
    },
    {
      "message": "NameError: name 'DateTime' is not defined",
      "occurrence_count": 8,
      "signal_score": 70,
      "context": { "file": "task.py", "line": 78 }
    }
  ],
  "total_new": 2
}
```

25 occurrences of a missing column! The agent realizes: migrations haven't been applied. It runs `alembic upgrade head`, restarts the server, and verifies:

```
Agent: clear_errors()
Agent: verify_fix(duration_seconds: 15)
```

TracePulse watches for 15 seconds, confirms zero new errors, and returns:

```json
{
  "verdict": "PASS",
  "summary": "Fix verified: zero new errors in 15s, no build errors."
}
```

Done. Two migration-related bugs found and fixed in under 2 minutes.

**What happened behind the scenes:**
1. Every time a query hit the missing column, the Python traceback flowed through TracePulse
2. The Python parser extracted the error type and message
3. Fingerprint deduplication collapsed 25 identical errors into one event with `occurrence_count: 25`
4. The signal scorer gave it 95/100 (database error + high occurrence)
5. `get_new_errors` filtered to only fingerprints not seen in previous sessions
6. `verify_fix` combined watch + build check + error check into one call

---

## Example 3: The Edit-Verify Loop (15 Times Per Session)

**The problem:** After every code change, the agent needs to know: did it break anything?

**Without TracePulse:** The agent runs `npx vite build` manually after every change. Each build takes 5-10 seconds. Over a session with 15+ changes, that's 2-3 minutes of waiting.

**With TracePulse:**

After each edit, the agent calls:

```
Agent: get_build_errors()
```

TracePulse checks the buffer for TypeScript, ESLint, and Vite/webpack errors and returns instantly:

```json
{
  "errors": [],
  "total_count": 0,
  "last_build_at": 1714300005000,
  "oldest_event_at": 1714299990000
}
```

Zero errors, and `last_build_at` confirms the build actually ran. The agent moves on with confidence.

The agent called `get_build_errors` 23 times in one session. It replaced 15+ manual `vite build` runs and saved over 20 minutes. The agent's own assessment: "Single biggest time saver."

**What happened behind the scenes:**
1. Vite's dev server prints compilation results to stdout
2. The Vite/webpack parser catches any build errors
3. The build stats parser records module count and build time
4. The hot-reload detector notes when Vite successfully recompiles
5. `last_build_at` updates every time a reload event is detected
6. The agent reads the cached result - no waiting for a build to run

---

## Example 4: Confirming a Server Restart After a Crash

**The problem:** The agent was editing a Python file when uvicorn's file watcher triggered a reload mid-save, causing a brief crash.

**With TracePulse:**

The agent restarts the server and checks:

```
Agent: restart_server()
Agent: watch_for_errors(duration_seconds: 10)
```

TracePulse kills the old process, spawns a new one, auto-clears the error buffer, then watches for 10 seconds:

```json
{
  "events": [],
  "hot_reload_detected": true,
  "total_events_seen": 12,
  "pre_existing_errors": 0
}
```

Zero errors, hot-reload detected (uvicorn started successfully), 12 log events seen (server is active and producing output). The crash was transient - the fix is confirmed.

**What happened behind the scenes:**
1. `restart_server` sent SIGTERM to the old process, waited for exit, spawned a new one
2. The error buffer was auto-cleared so old crash errors don't confuse the verification
3. `watch_for_errors` subscribed to the buffer and collected events for 10 seconds
4. The uvicorn reload pattern (`WatchFiles detected changes`) matched, setting `hot_reload_detected: true`
5. `total_events_seen: 12` confirmed the server is alive and processing requests
6. `pre_existing_errors: 0` confirmed the buffer is clean

---

## Example 5: Full Project Health Check

**The problem:** The agent starts a new session and needs to know: is everything working?

**With TracePulse:**

One call:

```
Agent: get_project_health()
```

```json
{
  "healthy": false,
  "summary": "Issues: 2 runtime error(s); 1 unreachable service(s): Elasticsearch",
  "server": { "connected": true, "uptime_minutes": 45 },
  "errors": { "runtime": 2, "build": 0 },
  "infrastructure": {
    "summary": "3/4 services reachable",
    "unreachable": [{ "name": "Elasticsearch", "error": "connection refused" }]
  }
}
```

In one call, the agent knows: server is running, 2 runtime errors to investigate, Elasticsearch is down, everything else (PostgreSQL, Redis, S3) is fine. It can prioritize: fix Elasticsearch first (infrastructure), then investigate the 2 errors.

**What happened behind the scenes:**
1. TracePulse scanned `.env` for service URLs (DATABASE_URL, REDIS_URL, ELASTICSEARCH_URL, S3_ENDPOINT)
2. Background probes checked TCP connectivity to each service every 60 seconds
3. The error buffer was queried for runtime and build errors
4. `get_project_health` combined server status + infrastructure + errors into one response
5. The agent got a complete picture without calling 4 separate tools

---

## The Pattern

Every example follows the same pattern:

1. **Something happens** (error, crash, change, session start)
2. **Agent makes one TracePulse call** (get_errors, verify_fix, get_project_health)
3. **TracePulse returns structured data** (file:line, score, verdict)
4. **Agent acts immediately** (fix the bug, move on, investigate further)

No log reading. No copy-paste. No guessing. The agent sees what the server sees - in seconds, not minutes.
