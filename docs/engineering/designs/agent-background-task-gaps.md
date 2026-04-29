# Agent Background Task Gaps - Research & Opportunities

Research date: 2026-04-29

## The Core Problem

From research: "The problem is not that models cannot write code. The problem is that most codebases have no deterministic, queryable representation of their own structure, ownership, boundaries, runtime context, or verification state."

AI coding agents are blind to 6 categories of background state that human developers check constantly.

---

## Gap Analysis: What Agents Can't See

### 1. Server Lifecycle State

**What humans do:** Glance at terminal, see if server is running, check if it restarted.
**What agents can't do:** Know if the server is healthy, stuck, or crash-looping without explicit tool calls.

| Need | TracePulse Today | Gap |
|------|-----------------|-----|
| Is server running? | `get_runtime_status` | Covered |
| Did it crash? | `get_errors` (crash events) | Covered |
| Is it crash-looping? | Crash loop detector | Covered |
| Is it healthy (responding)? | `--health-url` probe | Covered |
| Restart it | `restart_server` | Covered |
| **Server resource usage (CPU/memory)** | **Not covered** | **Gap** |
| **Port conflicts** | **Not covered** | **Gap** |

### 2. Dependency State

**What humans do:** Run `pip install`, check `node_modules`, verify versions.
**What agents can't do:** Know if dependencies are installed, outdated, or conflicting.

| Need | TracePulse Today | Gap |
|------|-----------------|-----|
| Missing dependency errors | Parsed by Python/Node parsers | Covered |
| **Check if deps are installed** | **Not covered** | **Gap - could run `pip list` or `npm ls`** |
| **Outdated deps** | **Not covered** | **Gap - could run `npm outdated`** |
| **Security vulnerabilities** | **Not covered** | **Gap - could run `npm audit`** |
| Install a dependency | `run_and_watch("npm install X")` | Covered |

### 3. Database State

**What humans do:** Check migration status, verify schema, test connection.
**What agents can't do:** Know if the database is reachable, migrated, or has the right schema.

| Need | TracePulse Today | Gap |
|------|-----------------|-----|
| Migration errors | Migration parser (alembic/Django) | Covered |
| **Migration status (current head)** | **Not covered** | **Gap - could run `alembic current`** |
| **DB connection test** | **Not covered** | **Gap - infra patterns detect "connection refused"** |
| **Run migrations** | `run_and_watch("alembic upgrade head")` | Covered |
| **Schema validation** | **Not covered** | **Gap** |

### 4. Environment & Configuration

**What humans do:** Check .env, verify API keys are set, check ports.
**What agents can't do:** Know if the environment is correctly configured.

| Need | TracePulse Today | Gap |
|------|-----------------|-----|
| Missing env vars | Env validator (.env.example check) | Covered |
| **Port availability** | **Not covered** | **Gap - could check if port is in use** |
| **Config file validation** | **Not covered** | **Gap** |
| **API endpoint reachability** | Health prober (single URL) | Partial |

### 5. Build & Compilation State

**What humans do:** Watch terminal for build output, check for type errors.
**What agents can't do:** Know the current build state without polling.

| Need | TracePulse Today | Gap |
|------|-----------------|-----|
| Build errors | `get_build_errors` | Covered |
| Build success confirmation | `wait_for_build` | Covered |
| Module count / bundle size | Build stats parser | Covered |
| **Type coverage percentage** | **Not covered** | **Gap** |
| **Bundle size budget check** | **Not covered** | **Gap** |

### 6. Test State

**What humans do:** Run tests, check coverage, verify CI status.
**What agents can't do:** Know test state without running them.

| Need | TracePulse Today | Gap |
|------|-----------------|-----|
| Run tests and parse results | `run_and_watch("pytest")` | Covered |
| Test failure details | pytest/jest/vitest/go test parsers | Covered |
| **Test coverage percentage** | **Not covered** | **Gap - could parse coverage output** |
| **Which tests to run for a change** | **Not covered** | **Gap - needs file-to-test mapping** |

---

## Opportunity Matrix: What TracePulse Could Add

### Tier 1: Low effort, high impact (use `run_and_watch`)

These need no new architecture - just new skills that use `run_and_watch`:

| Tool Call | What it does | Languages |
|-----------|-------------|-----------|
| `run_and_watch("npm outdated")` | Check for outdated deps | Node.js |
| `run_and_watch("pip list --outdated")` | Check for outdated deps | Python |
| `run_and_watch("npm audit --json")` | Security vulnerability scan | Node.js |
| `run_and_watch("pip audit")` | Security vulnerability scan | Python |
| `run_and_watch("alembic current")` | Check migration status | Python/SQLAlchemy |
| `run_and_watch("npx tsc --noEmit")` | Type check | TypeScript |
| `run_and_watch("npx vitest --coverage")` | Test with coverage | JS/TS |
| `run_and_watch("pytest --cov")` | Test with coverage | Python |

**These all work TODAY** with `run_and_watch`. The agent just needs to know to use them. This is a SKILL.md update, not a code change.

### Tier 2: New parsers needed

| Parser | What it parses | Effort |
|--------|---------------|--------|
| npm audit parser | JSON vulnerability report | Low |
| Coverage parser | Istanbul/pytest-cov output | Low |
| npm outdated parser | Outdated dependency table | Low |

### Tier 3: New tools needed

| Tool | What it does | Effort |
|------|-------------|--------|
| `check_port(port)` | Is a port in use? | Low |
| `get_env_status()` | Full env var report vs .env.example | Low (extend existing) |
| `get_dependency_status()` | Installed vs required deps | Medium |

---

## The Brex Pattern: Agent Reads Its Own CI Failures

Key insight from Brex engineering: "The agent finishes its changes, hits a wall of automated feedback it can't read, and stops."

Their solution: give the agent access to CI output so it can self-correct. TracePulse does this for local dev - the agent can read its own server errors, build failures, and test results.

**Extension opportunity:** If TracePulse could also parse CI output (GitHub Actions, GitLab CI), the agent could self-correct from CI failures too. This is a future direction, not current scope.

---

## The PocketOS Incident: Why Safety Matters

A Cursor agent running Claude deleted a production database in 9 seconds. TracePulse's `run_and_watch` has a command allowlist specifically to prevent this. The allowlist only permits: npx, npm, node, pytest, python, tsc, eslint, vitest, jest, go test, cargo test, make, bash.

`restart_server` only works in start mode (TracePulse owns the process). In attach mode, it returns an error telling the agent to restart manually.

---

## Language-Specific Server Management

TracePulse is language-agnostic but the agent needs to know language-specific commands. This is a SKILL.md concern:

### Node.js / TypeScript
```
tracepulse start "npm run dev"
run_and_watch("npm test")
run_and_watch("npx tsc --noEmit")
run_and_watch("npm audit")
run_and_watch("npm outdated")
```

### Python / Django / FastAPI
```
tracepulse start "uvicorn app:app --reload"
run_and_watch("pytest")
run_and_watch("alembic current")
run_and_watch("alembic upgrade head")
run_and_watch("pip audit")
run_and_watch("python manage.py check")
```

### Go
```
tracepulse start "go run main.go"
run_and_watch("go test ./...")
run_and_watch("go vet ./...")
run_and_watch("go build ./...")
```

### Rust
```
tracepulse start "cargo run"
run_and_watch("cargo test")
run_and_watch("cargo clippy")
run_and_watch("cargo build")
```

### Java / Spring Boot
```
tracepulse start "mvn spring-boot:run"
run_and_watch("mvn test")
run_and_watch("mvn compile")
```

---

## Recommendations

### Immediate (SKILL.md updates only)
1. Add language-specific command reference to SKILL.md
2. Add "dependency check" workflow using `run_and_watch`
3. Add "migration status" workflow using `run_and_watch`
4. Add "security audit" workflow using `run_and_watch`

### Short-term (new parsers)
5. npm audit JSON parser - parse vulnerability counts and severity
6. Coverage output parser - parse line/branch/function coverage percentages
7. npm outdated parser - parse outdated dependency table

### Medium-term (new tools)
8. `check_port(port)` - verify port availability before starting server
9. `get_dependency_status()` - compare installed vs required dependencies
10. `get_project_health()` - composite: deps + env + db + server + tests in one call
