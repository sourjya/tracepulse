# Project Audit

TracePulse tools aren't just for debugging - they're a project health audit system. Ask your agent to run these checks before deploying, before a PR, or at the start of each day.

## Quick Audit (30 seconds)

Ask your agent:

```
Run a TracePulse project audit
```

The agent calls these in sequence:

### 1. Project Health
```
get_project_health()
```
Server status, infrastructure connectivity, error count, build status, migration framework - all in one call.

### 2. Drift Detection
```
check_drift()
```
Missing .env variables, missing lock files, detected migration framework. Catches "works on my machine" issues before they reach CI.

### 3. Error Clusters
```
get_error_clusters()
```
Groups recurring errors by type and module. Shows patterns like "5 TypeErrors in src/api/" instead of individual events.

### 4. Performance Baseline
```
get_perf_baseline()
```
Per-endpoint response times (P50, P95, max). Flags slow endpoints before they become production issues.

### 5. Session Impact
```
get_session_impact()
```
How many tokens and energy were saved this session. Useful for team reporting and sustainability metrics.

---

## Pre-Deploy Checklist

Ask your agent:

```
Run pre-deploy checks with TracePulse
```

| Check | Tool | What it catches |
|-------|------|----------------|
| No runtime errors | `get_errors(limit: 5)` | Unhandled exceptions, 500s |
| Build clean | `verify_build()` | TypeScript errors, build failures |
| No drift | `check_drift()` | Missing env vars, pending migrations |
| Infrastructure healthy | `get_infra_status()` | DB/Redis/services reachable |
| No slow endpoints | `get_perf_baseline()` | Response time regressions |
| Tests pass | `run_and_watch("pytest tests/")` | Test failures with file:line |

---

## Pre-PR Checklist

Ask your agent:

```
Run pre-PR checks
```

| Check | Tool | What it catches |
|-------|------|----------------|
| My changes don't break anything | `verify_build(cwd: "./frontend")` | Compile + build + runtime |
| No new errors from my changes | `correlate_with_diff()` | Errors linked to uncommitted changes |
| Tests still pass | `run_and_watch("npx vitest run")` | Regressions |
| No drift introduced | `check_drift()` | Forgot to update .env.example |

---

## Daily Standup Health Check

Ask your agent at the start of each session:

```
What's the project health?
```

One call to `get_project_health()` tells you everything: server running, infrastructure reachable, error count, build status, migration framework detected. Takes 2 seconds, costs ~200 tokens.

---

## Team Audit (with TracePulse Team Server)

When TracePulse Team Server ships (M19), these same commands work across the entire team:

- `get_project_health()` covers shared staging
- `get_error_clusters()` shows team-wide error patterns
- `get_session_impact()` reports combined token/energy savings
- `get_audit_trail()` shows tool usage across all developers
