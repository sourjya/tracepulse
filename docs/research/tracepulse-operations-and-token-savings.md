# TracePulse: How It Works, Feature Inventory, and Token Savings Analysis

## 1. How TracePulse Operates

### Architecture

TracePulse sits between the dev server and the AI coding agent:

```
Dev Server (stdout/stderr) -> TracePulse Pipeline -> MCP Tools -> AI Agent
```

The pipeline processes every line of output through 7 stages:
1. **ANSI stripping** - removes terminal color codes
2. **Secret redaction** - 16 patterns (API keys, JWTs, connection strings, etc.) replaced with [REDACTED]
3. **Hot-reload detection** - 12 framework patterns (Vite, webpack, nodemon, uvicorn, air, etc.)
4. **Multi-line accumulation** - joins Python tracebacks, Java stack traces across lines
5. **Parser registry** - 25 framework-specific parsers try to match in priority order
6. **Signal scoring** - additive 0-100 score based on severity, stack trace, user code, HTTP status
7. **Fingerprint deduplication** - SHA-256 hash of normalized message + file:line. Same error appears once with occurrence_count.

### Storage

Events go into a 500-slot ring buffer with:
- Fingerprint-based dedup (same error updates count, doesn't consume a slot)
- Pinned errors (signal_score >= 50 survive eviction, max 50 pinned)
- Score decay (transient 401/403 errors lose priority after 60s)
- Error lifecycle (auto-detect resolved errors, auto-expire HMR transients)

### Delivery

31 MCP tools serve data to the agent over JSON-RPC (stdio). The agent calls tools like function calls and gets structured JSON responses.

### Modes

| Mode | What it does |
|------|-------------|
| `start "command"` | Spawns the dev server, captures stdout/stderr |
| `attach --log-file path` | Tails an existing log file |
| `standalone` | No collector - tools only (for libraries, fresh projects) |
| `compose --file docker-compose.yml` | Discovers Docker Compose services |

---

## 2. Complete Feature Inventory

### 31 MCP Tools

**Health & Status (5 tools)**
| Tool | What it returns | Tokens |
|------|----------------|--------|
| `get_project_health()` | Server + infra + errors + build + migration framework in one call | ~200 |
| `get_runtime_status()` | Connection state, error count, uptime | ~100 |
| `get_health_summary()` | One-line: "3 errors, 1 warning, uptime 12min" | ~100 |
| `check_port(port)` | Is a TCP port available or in use? | ~50 |
| `list_services()` | Multi-service mode: names, statuses, error counts | ~200 |

**Error Discovery (6 tools)**
| Tool | What it returns | Tokens |
|------|----------------|--------|
| `get_errors(limit?, since?, message_contains?)` | Errors sorted by signal_score with routing hints when empty | ~1,000 |
| `get_build_errors(limit?)` | TypeScript/ESLint/Vite/webpack errors + warnings + build stats | ~1,500 |
| `get_new_errors(limit?)` | Only fingerprints not seen in previous sessions | ~1,000 |
| `get_error_context(fingerprint)` | Full error + surrounding logs +/-5s + occurrence count + fix suggestion | ~3,000 |
| `get_error_trends(fingerprint)` | Cross-session frequency and history | ~500 |
| `get_error_clusters(min_count?)` | Group errors by type + module path | ~500 |

**Verification (5 tools)**
| Tool | What it returns | Tokens |
|------|----------------|--------|
| `verify_fix(duration_seconds?, fingerprint?)` | Watch + build + errors. Pass/fail verdict. Claim-checking: "target error resolved" | ~500 |
| `verify_build(typecheck_command?, build_command?, cwd?)` | tsc + build + runtime in one call | ~500 |
| `watch_for_errors(duration_seconds?)` | Block N seconds, collect new errors, report hot_reload_detected | ~1,000 |
| `wait_for_build(timeout_seconds?)` | Block until next build completes (event-driven) | ~200 |
| `wait_for_event(type?, timeout_seconds?)` | Block until next error/warning/build/crash | ~200 |

**Execution (3 tools)**
| Tool | What it returns | Tokens |
|------|----------------|--------|
| `run_and_watch(command, cwd?, timeout_seconds?)` | Run command through 25 parsers, structured pass/fail. Diagnostics on failure. | ~1,000 |
| `get_requests(path?, status_code_min?)` | Recent HTTP requests filtered by path and status | ~1,000 |
| `get_migration_status(framework?, apply?)` | Check or apply pending migrations (alembic/prisma/django/knex) | ~200 |

**Correlation (2 tools)**
| Tool | What it returns | Tokens |
|------|----------------|--------|
| `correlate_with_diff()` | Link errors to uncommitted git changes | ~1,000 |
| `get_correlated_errors(url?)` | Match browser HTTP failures with backend stack traces | ~2,000 |

**Infrastructure (4 tools)**
| Tool | What it returns | Tokens |
|------|----------------|--------|
| `get_infra_status()` | All backend services (DB, Redis, etc.) with connectivity | ~200 |
| `get_infra_detail(name)` | Per-service detail with probe history | ~200 |
| `register_probe(name, url)` | Register a health endpoint for periodic checking | ~100 |
| `list_probes()` | All registered probes with latest results | ~100 |

**Management (4 tools)**
| Tool | What it returns | Tokens |
|------|----------------|--------|
| `clear_errors(fingerprint?)` | Clear all or specific errors | ~50 |
| `restart_server()` | Kill and respawn dev server (start mode) | ~100 |
| `get_audit_trail(limit?, since?)` | Tool usage this session | ~500 |
| `get_perf_baseline(path?, limit?)` | Per-endpoint P50/P95/max response times | ~500 |

### 25 Error Parsers

**Runtime:** Node.js, Python, Pydantic, Go, Java/Spring Boot, Rust, JSON structured logs, Structlog key-value, HTTP access logs
**Build:** TypeScript, ESLint, Vite/webpack, Build stats
**Test:** pytest, Jest, vitest, Go test, cargo test, JUnit/Maven/Gradle
**Infrastructure:** Migration (alembic/Django), npm audit, Coverage
**Workers:** Celery, Sidekiq, BullMQ

### 12 Hot-Reload Detectors

Vite, webpack, nodemon, Next.js, ts-node-dev, uvicorn, Django, Flask, air (Go)

### 16 Secret Redaction Patterns

PEM keys, AWS keys, JWTs, GitHub/GitLab/Slack tokens, Stripe, npm, OpenAI/Anthropic, GCP service accounts, Azure connection strings, Datadog, Bearer/Basic auth, connection strings, key-value secrets (including quoted values)

### 10 Error Narrative Patterns

Python module not found, Node module not found, PostgreSQL connection refused, Redis connection refused, table/column does not exist, port in use, permission denied, out of memory, TypeScript errors

---

## 3. Token Savings Analysis

### How Tokens Are Saved

TracePulse saves tokens through 6 mechanisms:

#### Mechanism 1: Structured data replaces raw log reading

**Without TP:** Agent reads raw terminal output. A typical error investigation:
- Agent runs command via shell: ~200 tokens (command + response framing)
- Raw output: ~2,000-10,000 tokens (full terminal dump)
- Agent parses mentally: re-reads output, extracts file:line, identifies error type
- Total per error: ~5,000-12,000 tokens

**With TP:** Agent calls `get_errors()`:
- Tool call: ~50 tokens
- Structured response: ~200-500 tokens (JSON with file, line, error_type, signal_score)
- Total per error: ~250-550 tokens

**Savings: 10-20x per error investigation**

#### Mechanism 2: Fingerprint deduplication

**Without TP:** Same error fires 42 times. Agent sees 42 separate log entries, reads each one.
- 42 x ~500 tokens = ~21,000 tokens wasted on the same error

**With TP:** 42 occurrences collapse to 1 event with `occurrence_count: 42`.
- 1 x ~500 tokens = ~500 tokens
- Agent sees: "TypeError in auth.py:42 (42 occurrences)" - immediately knows it's a persistent issue

**Savings: 42x for high-occurrence errors**

#### Mechanism 3: Signal scoring eliminates noise triage

**Without TP:** Agent sees 50 log lines. Reads all 50 to find the 3 that matter.
- 50 x ~100 tokens = ~5,000 tokens reading noise

**With TP:** `get_errors(limit: 5)` returns the top 5 by signal_score.
- 5 x ~200 tokens = ~1,000 tokens, all actionable

**Savings: 5x from noise elimination**

#### Mechanism 4: Composite tools replace multi-call sequences

**Without TP:** Agent's verification loop:
1. `shell("npx tsc --noEmit")` - ~500 tokens
2. `shell("npx vitest run")` - ~2,000 tokens
3. `shell("npx vite build")` - ~1,000 tokens
4. Read and parse each output mentally
Total: ~3,500+ tokens, 3 tool calls

**With TP:** `verify_build(cwd: "./frontend")` - one call:
- ~500 tokens total, 1 tool call
- Returns: `{ verdict: "PASS", steps: [typecheck: OK, build: OK, runtime: OK] }`

**Savings: 7x per verification cycle. At 15 cycles/session: 45,000 tokens saved.**

#### Mechanism 5: Claim-checking prevents false "fixed" declarations

**Without TP:** Agent says "I fixed it" without verifying. The error persists. Agent discovers it 5 messages later, re-investigates.
- 5 wasted messages x ~1,000 tokens context = ~5,000 tokens

**With TP:** `verify_fix(fingerprint: "abc", duration_seconds: 5)`
- Returns: `{ verdict: "PASS", claim: { resolved: true, prior_occurrences: 42 } }`
- Or: `{ verdict: "FAIL", claim: { recurred_during_watch: true } }` - agent knows immediately

**Savings: 5,000 tokens per false-positive fix avoided**

#### Mechanism 6: Routing hints prevent wrong-tool exploration

**Without TP:** Agent calls `get_errors()`, gets empty, doesn't know what to do next. Tries 3-4 other tools blindly.
- 4 exploratory calls x ~500 tokens = ~2,000 tokens wasted

**With TP:** Empty `get_errors()` returns:
```json
{
  "diagnostics": "No backend errors.",
  "suggested_next": ["Chrome DevTools MCP: list_console_messages...", "ViewGraph: request_capture()..."]
}
```
Agent goes directly to the right tool.

**Savings: 2,000 tokens per wrong-tool exploration avoided**

### Measured Session Data

From real sessions across 3 projects:

| Metric | Without TP | With TP | Savings |
|--------|-----------|---------|---------|
| Tokens per error investigation | ~12,000 | ~1,000 | 12x |
| Tool calls for verification | 3 | 1 (verify_build) | 3x |
| Human messages per debug session | 8-12 | 0 | 100% |
| Time per debug session | 30+ min | <5 min | 80%+ |
| Stale errors re-investigated | 5-10 per session | 0 (fingerprint dedup) | 100% |
| run_and_watch calls per session | N/A | 40-70 | Replaces shell |

### Token Budget Impact

For a typical 25-turn agent session:

| Component | Without TP | With TP |
|-----------|-----------|---------|
| Error investigation (5 errors) | 60,000 tokens | 5,000 tokens |
| Verification cycles (15x) | 52,500 tokens | 7,500 tokens |
| Noise triage | 5,000 tokens | 0 (signal scoring) |
| False-positive fixes (2x) | 10,000 tokens | 0 (claim-checking) |
| Wrong-tool exploration (3x) | 6,000 tokens | 0 (routing hints) |
| **Total** | **133,500 tokens** | **12,500 tokens** |
| **Savings** | | **90.6%** |

---

## 4. Schema-Level Token Overhead

TracePulse's 31 tool schemas consume ~1,000 tokens at session start (after description compression). Over a 25-turn session, that's ~25,000 tokens of schema overhead.

**Planned optimization (M15):** Tool clustering reduces 31 schemas to 7 gateways (~200 tokens at session start). Sub-tool schemas load on demand. Projected: 85-90% schema reduction.

---

## 5. What TracePulse Cannot Save Tokens On

Honest assessment of where TP doesn't help:

1. **Code generation** - TP doesn't help the agent write code faster, only verify it works
2. **File reading** - TP doesn't reduce the tokens spent reading source files
3. **Frontend visual bugs** - TP can't see the UI (that's ViewGraph's job)
4. **Silent logic bugs** - if the code runs without errors but produces wrong output, TP can't detect it
5. **Context window management** - TP doesn't help with context compaction or memory
6. **Schema overhead** - 31 tool definitions add ~1,000 tokens per turn (M15 addresses this)
