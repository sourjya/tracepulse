# M12 Design

## Phase 1: Trust & UX

### 1. Why-empty diagnostics - DONE
Already built in `src/tools/empty-diagnostics.ts`.

### 2. Error clustering (`get_error_clusters`)
Groups errors by error_type + module path. Returns cluster summaries instead of individual events.

**Input:** `{ min_count?: number }` (default 2)
**Output:**
```json
{
  "clusters": [
    {
      "cluster_key": "TypeError|src/api/",
      "error_type": "TypeError",
      "module_path": "src/api/",
      "count": 5,
      "fingerprints": ["abc...", "def..."],
      "representative_message": "Cannot read properties of null",
      "first_seen": 1714300000000,
      "last_seen": 1714300500000
    }
  ],
  "total_clusters": 3,
  "total_errors": 12
}
```

**Implementation:** Query ring buffer, group by `(error_type, directory of context.file)`, sort clusters by count descending.

### 3. Background worker parsers
New parsers for async job frameworks. Same parser interface as existing parsers.

| Framework | Patterns |
|-----------|----------|
| Celery | `Task <name> raised`, `Task <name> succeeded`, `Task <name> retry` |
| Sidekiq | `WARN: <class> JID-<id> ...`, `ERROR: <class>` |
| BullMQ | `Job <id> failed`, `Job <id> completed` |

### 4. `get_migration_status` tool
Wraps `run_and_watch` with migration-specific commands and parsing.

**Input:** `{ framework?: "alembic" | "prisma" | "django" | "knex" }`
**Output:**
```json
{
  "framework": "alembic",
  "current_revision": "abc123",
  "head_revision": "def456",
  "pending_count": 2,
  "status": "behind",
  "suggestion": "Run: alembic upgrade head"
}
```

Auto-detects framework from project files if not specified.

### 5. Agent action audit trail
Log every MCP tool call to an in-memory ring buffer (separate from events).

**New tool:** `get_audit_trail(limit?, since?)`
**Output:**
```json
{
  "actions": [
    {
      "tool": "get_errors",
      "params": { "limit": 5 },
      "response_tokens": 1200,
      "duration_ms": 3,
      "timestamp": 1714300000000
    }
  ]
}
```

**Implementation:** Wrap each tool handler in server.ts with a logging decorator. Store in a 200-entry audit buffer.

### 6. Performance regression baseline
Track per-endpoint response times from HTTP access log parser.

**New tool:** `get_perf_baseline(path?, limit?)`
**Output:**
```json
{
  "endpoints": [
    {
      "path": "/api/v1/projects",
      "request_count": 45,
      "p50_ms": 120,
      "p95_ms": 450,
      "max_ms": 1200,
      "slow_count": 3
    }
  ]
}
```

### 7. Error narrative
Pre-formatted fix suggestions for common error patterns. Extends infra-patterns.ts.

| Pattern | Suggestion |
|---------|------------|
| `ModuleNotFoundError` | "Install missing package: pip install <name>" |
| `Cannot find module` | "Install missing package: npm install <name>" |
| `ECONNREFUSED :5432` | "PostgreSQL is not running. Start it: brew services start postgresql" |
| `relation does not exist` | "Run pending migrations" |
