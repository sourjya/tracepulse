# Changelog

All notable changes to TracePulse will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added (post-v0.8.1)

- **`get_requests` tool** (19th tool) - filter HTTP requests by path and status code
- **Debounced build errors** - opt-in 2s persistence filter on `get_build_errors(debounce: true)`
- **File change tracker** - correlates hot-reload events with file paths
- **Previous session error details** - `last_message` stored in fingerprint persistence
- **20/20 agent wishlist items shipped**

## [0.8.0] - 2026-04-29

### Added

- **Multi-file attach mode** - `tracepulse attach --log-file backend=./b.log --log-file frontend=./f.log`
- **HTTP access log parser** - uvicorn, express/morgan, nginx formats with status code and duration extraction
- **`status_code_min` filter** on `get_errors` and `get_server_logs` - filter to 4xx/5xx only
- **`message_contains` filter** on `get_errors` and `get_server_logs` - URL/path substring filtering
- **Pytest parser** - FAILED, ERROR, summary lines
- **Jest parser** - FAIL header, failure lines, Expected/Received assertions
- **Vitest parser** - FAIL file, assertion errors, summary
- **Go test parser** - `--- FAIL`, FAIL summary, error with file:line
- **Migration parser** - alembic and Django migration output
- **Crash loop detector** - 3+ restarts in 60s triggers signal_score 95 alert
- **Infrastructure error patterns** - 22 patterns for DB, network, memory, disk, Redis, TLS, DNS
- **Slow request alerting** - HTTP requests >1000ms flagged as [SLOW] warnings
- **Environment validator** - checks .env.example against process.env on startup
- **Health endpoint prober** - periodic GET to configurable endpoint via `--health-url`
- **`get_health_summary` tool** - one-line health check replacing 3 separate calls (15th tool)
- **`verify_fix` tool** - all-in-one post-fix verification: watch + build check + pass/fail verdict
- **`clear_errors(fingerprint)` selective clear** - clear specific errors without nuking everything
- **`last_build_at` timestamp** on `get_build_errors` response
- **`last_event_timestamp`** on `get_errors` response for cursor pattern
- **`total_events_seen`** on `watch_for_errors` response
- **Multi-line accumulator** - Python tracebacks now get file:line extraction from stack frames
- **Structlog key-value parser** - `[info]`, `[warning]`, `[error]` bracket format
- **4 agent workflow skills** - audit-endpoints, debugger-mode, github-issue, test-runner
- **8 agent skill files** total shipped with package

### Changed

- **`get_errors` response format** - structured object with freshness metadata
- **`hot_reload_detected`** returns `null` in attach mode instead of misleading `false`
- **All 15 tools always registered** - helpful error messages when dependencies not configured
- **Pipeline service name tagging** - multi-process events correctly tagged with service name
- **17 parsers** registered in priority order (was 10)

### Fixed

- All 7 tech debt items (TD-001 through TD-007) resolved
- ESLint v9 flat config working
- Intermittent multi-process test stabilized
- uvicorn/Django/Flask hot-reload patterns added

## [0.6.1] - 2026-04-28

### Added

- **`message_contains` filter** on `get_errors` and `get_server_logs` - case-insensitive substring match on message/raw fields for URL/path filtering
- **Structlog key-value parser** - parses Python structlog ConsoleRenderer `[level]` format, preserving actual log levels (10th parser)
- **Freshness metadata** on `get_errors` response - `session_started_at`, `oldest_event_at`, `buffer_cleared_at`, `total_matching`
- **Freshness metadata** on `get_build_errors` response - `oldest_event_at`, `buffer_cleared_at`
- **`session_started_at`** on `get_runtime_status` response
- **5 tools wired into MCP server** - `list_services`, `get_correlated_errors`, `get_new_errors`, `get_error_trends`, `correlate_with_diff` (13 total)
- **CLI wired for Phase 3-5** - multi-process (`--service`), persistence (`--persist`), all dependencies passed to MCP server
- **SKILL.md rewritten** - 13 tools documented, decision tree for TracePulse vs Chrome DevTools MCP, pro tips for `message_contains`, `since` cursor, manual FE-BE bridging
- **Architecture docs** - full architecture guide, Mermaid diagrams, tool responsibility matrix

### Changed

- **`get_errors` response format** - now returns `{ errors: [...], total_matching, session_started_at, oldest_event_at, buffer_cleared_at }` instead of plain array (breaking change, pre-1.0)

### Fixed

- **TD-001** - agent-reported data freshness gap resolved with metadata fields

_Work in progress toward v0.6.0 (Phase 5: Proactive Monitoring)._

### Added (Phase 5)

- **Severity classifier:** classifies events as crash/error/warning/info based on message patterns and log level
- **Fingerprint history manager:** tracks which errors have been seen across sessions with first_seen, last_seen, total_occurrences
- **`get_new_errors` MCP tool:** returns only errors with fingerprints not seen in previous sessions
- **`get_error_trends` MCP tool:** cross-session frequency and history for a specific fingerprint
- **Git diff correlator:** links errors to recent code changes by matching error file locations with git diff
- **`correlate_with_diff` MCP tool:** orchestrates git diff correlation and returns matched error-file pairs
- **Notification dispatcher:** determines when to alert on new high-signal errors (future MCP notification support)
- **3 agent skills:** backend-error-triage, edit-verify-loop, full-stack-debug workflows

### Added (Phase 4)

- **Frontend-backend correlation:** `get_correlated_errors(url?)` MCP tool matches browser HTTP failures with backend stack traces
- **Correlation engine:** trace ID matching (confidence 1.0) + URL path + timestamp proximity (0.9/0.7)
- **Frontend error buffer:** ring buffer (200 max, 5min TTL) for browser-side HTTP failures
- **Trace ID extraction:** W3C traceparent + Datadog x-datadog-trace-id header parsing
- **Log collector HTTP server:** POST /api/v1/errors on 127.0.0.1:9801 for browser error ingestion
- **Extended get_runtime_status:** now includes `correlation_source` and `frontend_error_count` fields
- **12 correlation constants:** buffer sizes, TTLs, confidence scores, port defaults

### Added (Phase 3)

- **Multi-process monitoring:** spawn and monitor multiple services via `--service` flags or `tracepulse.config.json`
- **Service registry:** tracks lifecycle state (running/stopped/crashed/restarting), error counts, last activity per service
- **Config system:** `tracepulse.config.json` with services, compose, transport, persist, correlation_window_ms
- **Config loader:** CLI flags > config file > defaults precedence, conflict detection
- **Docker log collector:** Docker Engine API frame parsing, compose service name extraction
- **Cross-service correlation:** temporal grouping of events from different services within configurable window (default 2s)
- **`list_services` MCP tool:** returns service names, statuses, error counts, last activity
- **`get_errors` service filter:** new `service` parameter to filter errors by service name
- **Streamable HTTP transport:** opt-in HTTP server on 127.0.0.1:9800 via `--http` flag
- **Fingerprint persistence:** load/save to `.tracepulse/fingerprints.json` via `--persist` flag, LRU eviction at 5000 entries
- **`compose` CLI subcommand:** `tracepulse compose --file docker-compose.yml`
- **CLI flags:** `--service`, `--config`, `--http`, `--http-port`, `--persist`

### Added

- **Watch mode:** `watch_for_errors(duration_seconds, source?)` - blocks for N seconds, collects new error/warn events, detects hot-reload
- **Hot-reload detection:** 8 patterns for Vite, webpack, nodemon, Next.js, ts-node-dev - injects synthetic info-level markers into the buffer
- **Build error parsers:** TypeScript compiler (`tsc`), ESLint, Vite/webpack build errors - all produce `source: 'build-error'` events
- **Error context:** `get_error_context(fingerprint)` - deep-dive with surrounding logs (±5s), occurrence count
- **Timeline query:** `get_timeline(since, duration_seconds?, limit?)` - unified chronological event stream
- **Build errors tool:** `get_build_errors(limit?)` - dedicated tool for compilation/build failures
- **Event buffer subscription:** real-time event delivery via subscribe/unsubscribe for watch controller
- **11 watch mode constants:** duration bounds, context windows, query limits, signal scores

---

## [0.2.0] - 2026-04-27

### Added

- **Process spawning:** `npx tracepulse start "npm run dev"` spawns dev server as child process, captures stdout/stderr
- **Log file tailing:** `npx tracepulse attach --log-file ./log` tails existing log files with truncation detection
- **6 error parsers:** Node.js, Python, Go, Java, Rust stack traces + JSON structured logs (pino, structlog, logback)
- **Parser registry:** ordered dispatch with first-match-wins, exception-safe
- **Event normalization:** all errors → unified RuntimeEvent schema with UUID, timestamp, fingerprint, signal score
- **Signal scoring:** additive 0–100 scoring (unhandled exception +40, stack trace +20, user code +15, etc.) with high/medium/low tiers
- **Fingerprinting:** SHA-256 dedup keys with message normalization (strips timestamps, PIDs, addresses, UUIDs)
- **Ring buffer:** bounded circular store (500 events), FIFO eviction, O(1) fingerprint dedup
- **Secret redaction:** 12 patterns (API keys, Bearer/Basic auth, JWTs, connection strings, PEM keys, GitHub/GitLab/Slack tokens) - runs before all storage
- **4 MCP tools:** get_errors (signal score sort), get_server_logs (timestamp sort), get_runtime_status (health check), clear_errors (reset buffer)
- **Graceful shutdown:** SIGINT/SIGTERM forwarding to child process with 5s timeout before SIGKILL
- **CLI:** `start` and `attach` subcommands, `--version`, `--help`
- **302 tests:** 16 unit test files + 3 integration test files, all passing

---

## [0.1.0] - 2026-04-27

### Added

- **Project scaffolding:** package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, eslint, prettier
- **Architecture decision:** [ADR-001 Tech Stack & Architecture](../decisions/ADR-001-tech-stack.md) - TypeScript/Node.js 22+, stdio transport, spawn+attach process management, framework-specific error parsers, salience-scored RuntimeEvents, pull-first MCP model
- **Kiro specs:** 5 phase specs under `.kiro/specs/` with requirements, design, and TDD task breakdowns (48 user stories, 83 TDD tasks total)
  - Phase 1: Core Pipeline MVP (19 stories, 23 tasks)
  - Phase 2: Watch Mode (6 stories, 14 tasks)
  - Phase 3: Multi-Process & Docker (8 stories, 18 tasks)
  - Phase 4: Frontend-Backend Correlation (8 stories, 11 tasks)
  - Phase 5: Proactive Monitoring (7 stories, 17 tasks)
- **Roadmap:** [docs/roadmap/roadmap.md](../roadmap/roadmap.md) with 6 milestones (M0–M6), linked specs, and ADRs
- **Research docs:** Competitive landscape analysis (40+ tools), feature-architecture analysis, developer pain point analysis
- **Kiro steering:** 12 steering files for code organization, testing, git workflow, security reviews, and project conventions
- **Stub entry points:** `src/index.ts` (MCP server) and `src/cli.ts` (CLI)
- **MCP SDK dependency:** `@modelcontextprotocol/sdk ^1.12.1`
