# Idea: Hung Test DB Lock Diagnosis

## Problem

When `run_and_watch` times out on a test/migration command, the root cause is often a stale database connection holding a lock. The agent currently has no way to diagnose this without dropping to Shell and running DB-specific diagnostic queries manually.

This is a common dev workstation issue across all platforms (Linux, macOS, Windows/WSL) and all major databases.

## Trigger

`run_and_watch` returns a timeout → TP detects a `DATABASE_URL` (or equivalent) in the project's environment → automatically runs DB-specific lock diagnostics and returns structured results.

## Design: Pluggable DB Diagnostics

Follows the existing parser plugin pattern (each DB type is a separate module implementing a common interface).

### Interface

```typescript
interface DbLockDiagnostic {
  /** Database type this diagnostic handles */
  readonly dbType: 'postgresql' | 'mysql' | 'sqlite' | 'mssql' | 'mongodb';

  /** Connection string patterns this diagnostic recognizes */
  matchesUrl(url: string): boolean;

  /** Run lock/connection diagnostics, return structured results */
  diagnose(url: string): Promise<DbLockReport>;
}

interface DbLockReport {
  dbType: string;
  reachable: boolean;
  activeConnections: number;
  blockingQueries: BlockingQuery[];
  staleSessions: StaleSession[];
  recommendation: string; // e.g., "2 stale connections from PID 12345 holding locks on table 'users'. Terminate with pg_terminate_backend(12345)."
}

interface BlockingQuery {
  pid: number | string;
  duration: string;       // e.g., "5m32s"
  state: string;          // e.g., "idle in transaction"
  query: string;          // truncated, redacted
  blockedBy?: number;     // PID of blocker
}

interface StaleSession {
  pid: number | string;
  state: string;
  idleDuration: string;
  database: string;
}
```

### DB-Specific Diagnostics

| DB | Detection pattern | Diagnostic query | Platform notes |
|---|---|---|---|
| **PostgreSQL** | `postgresql://`, `postgres://` | `pg_stat_activity` + `pg_locks` | Works same on all OS. Needs `psql` or `pg` npm driver. |
| **MySQL** | `mysql://`, `mysql2://` | `SHOW PROCESSLIST` + `INFORMATION_SCHEMA.INNODB_LOCK_WAITS` | Works same on all OS. Needs `mysql` CLI or `mysql2` driver. |
| **SQLite** | `sqlite:///`, `.db` file path | Check for `.db-wal` lock file, `fuser`/`lsof` on the file | Linux/macOS: `lsof`. Windows: `handle.exe` or PowerShell. |
| **MSSQL** | `mssql://`, `sqlserver://` | `sys.dm_exec_requests` + `sys.dm_tran_locks` | Common on Windows dev. Needs `sqlcmd` or `mssql` driver. |
| **MongoDB** | `mongodb://`, `mongodb+srv://` | `db.currentOp()` + `$where` for long-running ops | Less common lock issue but connection pool exhaustion happens. |

### Platform-Specific Considerations

| Platform | SQLite lock detection | Process identification |
|---|---|---|
| **Linux** | `fuser`, `lsof` | `/proc/<pid>/cmdline` |
| **macOS** | `lsof` | `ps -p <pid>` |
| **Windows/WSL** | `handle.exe` (Sysinternals), PowerShell `Get-Process` | `wmic process` |

### Execution Strategy

Two modes for running diagnostics:

1. **CLI-based** (zero dependencies): Shell out to `psql`, `mysql`, `sqlite3`, `sqlcmd`. Available on most dev machines. Parse text output.
2. **Driver-based** (if available): Use the project's own DB driver (detected from `package.json` / `requirements.txt`). More reliable parsing.

Prefer CLI-based for v1 — no new dependencies, works if the project's DB driver is the one that's hung.

### Integration Point

Fits naturally into `get_cross_layer_diagnosis`:

```
Timeout detected on: .venv/bin/python -m pytest tests/unit/auth/
Database detected: postgresql://...@localhost:5432/myapp_test
Lock diagnosis:
  - 2 idle-in-transaction sessions (PIDs 45231, 45232) holding locks
  - Oldest: 12m ago, query: "SELECT ... FROM users WHERE ..."
  - Recommendation: Terminate stale sessions. Run: SELECT pg_terminate_backend(45231);
```

### New Tool (optional)

Could also expose as a standalone tool:

```
diagnose_db_locks(url?: string)
```

Auto-detects URL from env if not provided. Returns the `DbLockReport`.

## Scope

- Phase 1: PostgreSQL + MySQL (covers 90% of dev workstation cases)
- Phase 2: SQLite + MSSQL
- Phase 3: MongoDB, connection pool exhaustion detection

## Not In Scope

- Fixing the locks automatically (too dangerous — agent should recommend, not act)
- Production database diagnosis (localhost only, security boundary)
- Connection pooling configuration advice

## Open Questions

- Should this fire automatically on timeout, or only when the agent calls `get_cross_layer_diagnosis`?
- Should we limit to localhost connections only (safety) or allow any URL in the env?
- How to handle auth failures gracefully (user's DB password might not have `pg_stat_activity` access)?
