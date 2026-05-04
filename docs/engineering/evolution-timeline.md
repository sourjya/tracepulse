# TracePulse Evolution Timeline

How TracePulse evolved from feedback, bugs, and real-world usage. Each entry links to the source that drove the change.

## v0.9.13 (2026-05-04) - Zero-Config & Installation Fixes

**Driven by:** Real installation failure on CoreIQ (Python/FastAPI project)

| Change | Source | Impact |
|--------|--------|--------|
| Zero-config: bare `tracepulse` starts standalone | User couldn't figure out start/attach/standalone modes | Any project works with `{"command": "tracepulse"}` |
| `start_server` tool (mid-session server start) | Agent needs to start server after project detection | Layer 2 activates on demand, not at startup |
| Project detection (7 stacks) | Agent didn't know what kind of project it was in | `get_project_health` suggests start commands |
| Startup diagnostics | `PYTHONPATH=src python app.py` failed silently | Clear error: "shell syntax, use env field" |
| Shell bin wrapper | npm global symlink broke ESM imports (BUG-018) | `tracepulse` command works on all platforms |
| `bin/` in npm files | Wrapper wasn't shipped in package (BUG-019) | Global install actually includes the fix |
| Standalone `isConnected: false` | Health showed "server running" with no server (BUG-017) | Suggestions appear correctly |

## v0.9.8-0.9.11 - Token Savings & Bug Patterns

**Driven by:** Advanced token savings research + agent feedback on repeated errors

| Change | Source | Impact |
|--------|--------|--------|
| Clustered mode (`--clustered`) | MCP tooling research: 80% schema waste | 39 tools -> 7 gateways, ~22,500 tokens/session saved |
| Bug pattern detection (6 types) | Agents re-investigating same errors across sessions | Recurring, flaky, velocity, chains, fixed-but-back, degradation |
| Persistence as default | Pattern detection useless without history | `--no-persist` to opt out instead of `--persist` to opt in |
| Compact field names | Response size analysis | 10-20% smaller responses |
| Semantic error grouping | 5 errors at same file:line -> 1 with variant_count | ~500 tokens/session saved |
| Diff correlation cache | Agent calling correlate_with_diff repeatedly | Cached for 30s after HMR |

## v0.9.7 - Agent Workflow Intelligence

**Driven by:** 78 agent feedback entries from Nexus and Prism projects

| Change | Source | Impact |
|--------|--------|--------|
| `run_and_watch` allowlist expanded | Agent rejected for `python`, `cargo build`, `mvn` | Fewer shell fallbacks |
| Stack-aware allowlist | Python project auto-allows pytest, uv, mypy | Zero "Command not allowed" for detected stacks |
| `.venv` auto-detection in PATH | run_and_watch gave different results than shell | Python commands find right packages |
| Usage nudge in `get_session_insights` | 4 sessions of agents using shell over TP | "Tip: use run_and_watch instead of shell" |
| `verify_build` composite tool | Agent making 3 separate calls (tsc + build + verify) | One call replaces three |
| `check_drift` unified tool | Agent checking env, deps, migrations separately | One call for all drift |

## v0.9.2-0.9.6 - Infrastructure & Proactive Monitoring

**Driven by:** Deep competitive research + gap analysis vs Sentry/Lightrun

| Change | Source | Impact |
|--------|--------|--------|
| Infrastructure discovery from .env | Agent couldn't tell if DB was connected | `get_infra_status` probes services |
| `get_project_health` composite | Agent making 4+ calls to understand project state | One call: server + infra + errors + build |
| Fingerprint persistence | Agent re-investigating same errors every session | `get_new_errors` shows only unseen |
| Error lifecycle (auto-expire HMR transients) | Hot-reload errors cluttering get_errors | Transient errors auto-expire |
| Score decay for 401/403 | Auth errors dominating error list | Decay after 60s if not recurring |

## v0.7.0-0.9.1 - Parser Expansion & Agent Skills

**Driven by:** Real agent sessions on Nexus (full-stack web app)

| Change | Source | Impact |
|--------|--------|--------|
| pytest/jest/vitest parsers | Test failures were major error source TP missed | Structured test results |
| HTTP access log parser | Agent couldn't see 500 errors from uvicorn | Status codes, response times |
| SKILL.md with 30+ query mappings | Agent didn't know which tool to call | "Any errors?" -> `get_errors` |
| Multi-file attach mode | Agent couldn't see frontend + backend logs | Tag each log file with service name |
| Secret redaction (16 patterns) | API keys appearing in MCP responses | GCP, Azure, Datadog, JWT, PEM |

## v0.2.0-0.6.0 - Core Pipeline

| Change | Source | Impact |
|--------|--------|--------|
| 26 error parsers | Node, Python, Go, Java, Rust, JSON, structlog | Structured errors from any stack |
| Signal scoring (0-100) | Not all errors are equal | High-signal errors surface first |
| Watch mode | Agent needed to verify fixes | `verify_fix` returns pass/fail |
| Multi-process | Real projects have multiple services | `--service` flag, service tagging |
| Frontend-backend correlation | Browser 500 + backend traceback are the same bug | `get_correlated_errors` pairs them |

---

## Metrics

| Metric | Value |
|--------|-------|
| npm versions published | 16 (v0.2.0 through v0.9.13) |
| MCP tools | 39 |
| Error parsers | 26 |
| Tests | 968 |
| Agent feedback entries | 15 sessions logged |
| Wishlist items | 39 (22 shipped) |
| Bugs documented | 19 (BUG-001 through BUG-019) |
| Installation test scenarios | 21 |
| Integration test scenarios | 20 |

## Feedback Loop

```
Agent uses TracePulse in real project
  -> Agent hits friction or gap
    -> Feedback logged in agent-feedback-log.md
      -> Wishlist item created
        -> Spec written, TDD built, shipped
          -> Agent uses improved version
            -> (repeat)
```

Every feature since v0.7.0 was driven by real agent feedback, not speculation.
