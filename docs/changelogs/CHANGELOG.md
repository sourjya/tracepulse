# Changelog

All notable changes to TracePulse will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **TRP-86:** `tracepulse report [--html]` — an on-demand, read-only view over persisted telemetry (`.tracepulse/telemetry.json`). Terminal form prints totals + a Unicode sparkline of errors-per-session + top recurring fingerprints; `--html` writes a single self-contained HTML dashboard (inline SVG bar charts, theme-aware, no external requests) to `.tracepulse/report.html`. Kept entirely off the hot path — no server, no daemon; it just formats data that already exists. Footer directs to `get_effectiveness_report` for the measured fix/recurrence rates (not persisted here).
- **TRP-84:** New `get_effectiveness_report` MCP tool — TracePulse's MEASURED lifecycle outcomes (confirmed-fix / recurrence / suppressed rates) as `{value, n, 95% Wilson CI}`, version-stamped, `provenance: measured`. The honest, observed counterpart to `get_session_impact`'s modeled estimate. (Adds a tool; the "44 tools" doc counts are now stale — deferred to a doc sweep.)
- **TRP-73:** Telemetry & savings-measurement research doc (`docs/research/telemetry-savings-measurement.md`). Finding: the audit buffer, lifecycle FSM, and journal rollup are built + unit-tested but never wired into the live tool-call path, so telemetry emits zeros and every savings number is asserted (from hardcoded 12×/3× multipliers), not measured; also a 10× disagreement in the energy constant (`0.34` vs `0.034`). Proposes a phased model (wire existing code first) and an on-demand, off-the-hot-path `tracepulse report` HTML surface. Spun child tickets TRP-78…TRP-86.
- **TRP-72:** Documented Claude Code support. New dedicated [Claude Code](../../gitbook/getting-started/claude-code.md) GitBook page (one-command `init --claude`, the friction gate, verification, manual setup, troubleshooting); refreshed the stale Claude section in Agent Integration; corrected MCP Client Setup to note Claude Code reads project-root `.mcp.json`/`~/.claude.json` (not `.claude/mcp.json`); README + product positioning now surface first-class Claude Code integration.
- **TRP-77:** Tracked local pre-push gate. `main` isn't branch-protected (no paid GitHub plan), so red CI never blocked a merge. `.githooks/pre-push` now runs `lint → build → test` and blocks the push on failure (human-only bypass: `TRACEPULSE_PUSH_GATE_BYPASS=1`); `.githooks/pre-commit` carries forward the private-name leak guard; a `prepare` script points `core.hooksPath` at `.githooks/` so a fresh clone gets the gate on `npm install`.

### Fixed
- **TRP-81:** Made the telemetry numbers honest. The energy constant disagreed 10× between two files (`get_session_impact` used `0.34` Wh/1K tokens, `pattern-cost` used `0.034`); reconciled to a single cited source of truth (`src/analysis/energy-model.ts`, adopting the peer-reviewed `0.034`). Both `get_session_impact` and `calculatePatternCost` now stamp outputs with `provenance: "estimated (unvalidated model)"` + source citations, and `get_session_impact`'s methodology explicitly flags the 12×/3× savings multipliers as **assumptions**, not measurements.
- **TRP-80:** The journal `session_end` rollup hardcoded `errors_suppressed: 0, errors_resolved: 0`. It now derives them from `computeLifecycleMetrics(lifecycleFsm)` (`suppressed_count` / `resolved_count`), so cross-session telemetry in `.tracepulse/telemetry.json` reflects real lifecycle outcomes. Falls back to zeros when no FSM is wired. Third of the TRP-73 telemetry-wiring tickets — completes the inert→live flip (audit buffer + FSM + journal rollup).
- **TRP-79:** The lifecycle FSM never advanced past `first_seen` because its episode hooks were never fired, so `get_session_insights` `lifecycle_metrics` was all-zeros. Wired the hooks into the tool handlers: `get_errors` → `onErrorsSurfaced`, `get_error_context`/`get_prompt_context`/`acknowledge_error` → `onErrorInvestigated`, `run_and_watch` → `onCommandRun`. Verified end-to-end: a real `get_errors` then `get_error_context` call advances a fingerprint `first_seen → surfaced → investigated`. Second of the TRP-73 telemetry-wiring tickets.
- **TRP-78:** Telemetry was dead on the wire — `auditBuffer.record` and `journalToolCall` were never called on the live tool-call path, so `get_session_impact` / `get_audit_trail` / the journal rollup read empty and reported zeros. Added telemetry middleware (`src/mcp/tool-telemetry.ts`) wrapping every `registerTool` handler to record token/latency to the audit buffer and journal the call. Best-effort (never breaks a tool call); verified end-to-end via a real MCP protocol call. First of the TRP-73 telemetry-wiring tickets.
- **TRP-74:** `tracepulse init --claude` installed `tracepulse-gate.sh` into `.claude/hooks/` but never declared it in a settings file, so Claude Code never ran it — the friction-gradient gate shipped dormant. Init now registers a Bash `PreToolUse` entry in `.claude/settings.json` (deep-merged, idempotent) pointing at the copied gate.
- **TRP-75:** `tracepulse init --claude` wrote MCP config to `.claude/mcp.json`, a path Claude Code does not read (it reads project-root `.mcp.json` or `~/.claude.json`), so consumers never got the TracePulse MCP server connected. Init now writes to project-root `.mcp.json`, matching the generic branch.
- **TRP-76:** CI was red on `main` across multiple merges. Fixed all four causes: (1) `eslint.config.js` now declares Node globals for `tests/fixtures/**` (was 15 `no-undef` errors); (2) `src/store/lifecycle-fsm.ts` `fsmInstance` is now `const` (was a `prefer-const` error; no behavior change); (3) the CI `test` job now runs `npm run build` before `npm test` so `dist/cli.js` exists for the integration smoke tests; (4) all CI jobs run Node 22 (the project's required/target version), fixing the `doctor` Node-version check.

---

## [0.9.30] - 2026-07-11

### Added
- **Agent steering updates** — `skills/tracepulse/SKILL.md`, `skills/CLAUDE.md`, and `skills/claude-rules/tracepulse.md` now document lifecycle tracking, `get_session_insights()` lifecycle metrics, and the `--persist` event journal. Agents are taught that lifecycle tracking is automatic and that `get_session_insights()` reports fix rates.

### Changed
- 44 MCP tools, 1362 tests passing
- Re-run `tracepulse init` to sync updated steering files to your project

---

## [0.9.29] - 2026-07-11

### Fixed
- **SRR-007 H-001:** Unbounded `commandFingerprints` Map in lifecycle-hooks.ts — added LRU eviction cap at 100 entries (CWE-400 fix)
- **SRR-007 M-001:** Unbounded `states` Map in lifecycle-fsm.ts — capped at 1000 fingerprints with LRU eviction (also cleans up episodes and timers for evicted fps)
- **SRR-007 M-002:** Unbounded `episodeHistory` per fingerprint — capped at 10 episodes per fingerprint, oldest dropped

### Changed
- 44 MCP tools, 1362 tests passing (up from 1330)

---

## [0.9.28] - 2026-07-11

### Added
- **Event journal (D1)** — append-only JSONL persistence at `.tracepulse/events.jsonl`. Every error/warn event is flushed synchronously to disk, surviving crashes. On startup, the journal is compacted into `telemetry.json` (aggregated metrics per session and fingerprint). Eliminates survivorship bias — crash sessions are no longer lost from metrics.
- **Lifecycle state machine (D4)** — per-fingerprint FSM tracks errors through 7 states: `first_seen → surfaced → investigated → edit_observed → suppressed → resolved → recurred`. Deterministic transition table with episode tracking (duration, tool calls, outcome per investigation episode).
- **Resolution timer** — when a fingerprint enters `edit_observed`, a 30-second timer starts. If the error doesn't recur, it auto-transitions to `suppressed`. Recurrence before the timer fires cancels it and transitions to `recurred`.
- **Suppressed vs resolved distinction (D16)** — default outcome is `suppressed` (fingerprint absent, unconfirmed). `resolved` requires re-exercise evidence (same command ran again, no recurrence). Honest metrics: `mean_time_to_fix` computed on confirmed fixes only.
- **Lifecycle hooks** — decoupled integration layer (`lifecycle-hooks.ts`) connecting MCP tool handlers to the FSM. `get_errors` → surfaced, `get_error_context` → investigated, HMR → file_changed, recurrence → recurred.
- **Spec**: `.kiro/specs/m27-event-journal/` (requirements, design, tasks)

### Changed
- 44 MCP tools, 1330 tests passing (up from 1199 — 131 new tests)
- New source files: `journal-types.ts`, `event-journal.ts`, `journal-bridge.ts`, `lifecycle-fsm.ts`, `lifecycle-hooks.ts`

---

## [0.9.27] - 2026-07-11

### Added
- **Friction gradient inversion** — `tracepulse init` now ships `autoApprove` for all 44 tools, ensuring agents use TracePulse without permission prompts. Without this, agents defaulted to shell (the #1 cause of TracePulse underutilization).
- **Claude Code deny hook** — `tracepulse init --claude` installs `tracepulse-gate.sh` PreToolUse hook that blocks Bash for test/build/lint runners. Strips heredoc bodies and quoted spans before matching (prevents false positives on commit messages and fixture strings).
- **Extended shell-fallback anti-pattern guide** — shipped in `skills/kiro-steering/tracepulse-subagent-rules.md` with command-type table, failure pattern documentation, correct/incorrect examples, and Python venv section.
- **Venv auto-activation surfacing** — `run_and_watch` now reports `venv_activated` in the JSON response and logs to stderr when `.venv/` is auto-detected. Agents no longer need to guess whether venv is active.
- **M27 Effectiveness Telemetry spec** — full requirements for persistent cross-session telemetry (6 features, 18 research-driven spec deltas). Roadmap entry added.
- **`docs/how-we-improve.md`** — candid writeup of friction gradient discovery, discoverability gaps, guard hook fragility, and multiplier honesty.

### Fixed
- **TRP-4: `run_and_watch` schema description** — removed false "(up to 120)" timeout_seconds claim. There is no maximum.
- **TRP-22: uvicorn/Django HMR detection** — expanded patterns to cover `"Detected changes in"` (common format), `"Application startup complete"` (reload finished signal), and Django's `"System check identified no issues"`. Removed false-positive `"Shutting down$"`.
- **TRP-25: rejection message discoverability** — context-aware suggestions (Python hints, venv auto-activation note, closest prefix matches) instead of dumping the full 30-item allowlist.

### Changed
- 44 MCP tools, 1199 tests passing (up from 1196)
- All shipped steering files updated to remove false 120s timeout cap
- README Quick Start includes autoApprove callout
- Roadmap updated with M27 milestone

---

## [0.9.26] - 2026-07-11

### Fixed
- **TRP-5: `run_and_watch` prefix allowlist too restrictive** — moved `python`, `python3`, `pytest`, `.venv/bin/`, `uv`, `go test/run/build/vet`, `cargo`, `sh` into BASE_PREFIXES so they work without needing stack detection. Python projects no longer force shell fallback.
- **`verify_mcp` tests** — rewrote to use a fixture script (`tests/fixtures/mock-mcp-server.js`) instead of inline `node -e` commands that triggered the shell metacharacter security check.
- **Clustered mode tool count** — added `get_prompt_context` and `verify_loop` to `cluster-config.json` (were registered in server but missing from config). Test now derives expected count from config instead of hardcoding.
- **Error message accuracy** — `run_and_watch` rejection message now shows the actual allowlist, not a hardcoded default.

### Changed
- 44 MCP tools total (up from 42), 1196 tests passing
- Updated all gitbook docs, README, CLAUDE.md, and product docs to reflect 44 tools

---

## [0.9.25] - 2026-06-05

### Fixed
- **BUG-021: `start_server` port pre-check** — `start_server` now accepts a `port` parameter and validates it is free before spawning. If the port is occupied, it returns a structured `{ status: "port_in_use", port, hint, next_steps }` response immediately instead of spawning and crashing with EADDRINUSE. Prevents the agent retry-loop pattern (5+ redundant `start_server` calls) caused by opaque spawn failures.

### Added
- **`get_new_errors` `since` timestamp filter** — `since` (Unix ms) parameter scopes results to events after a given timestamp. Use `Date.now()` captured before a smoke test to see only errors that appeared during that specific test run. Eliminates false positives from pre-existing errors.

### Improved
- **Steering / skill updates** — new chokepoint pattern categories added to all repos (`QUERY_OMISSION`, `QUERY_LOADING_STATE`, `SESSION_DEADLOCK`, `OPTIONAL_SERVICE_BLOCKING`, `AUTH_BYPASS`, `CONFIG_MISMATCH`, `ERROR_BOUNDARY_CASCADE`, `INFRA_SILENT_DEATH`, `MCP_PHANTOM_FAILURE`, `COMMIT_NOISE`). Subagent rules in `tracepulse-subagent-rules.md` extended with `get_new_errors({ since })` post-smoke-test guidance.

---

## [0.9.24] - 2026-05-29

### Improved
- **`tracepulse init` overhaul** — borrowed best patterns from ViewGraph's init:
  - **MCP config merging** — reads existing config and merges the `tracepulse` key instead of skipping when file exists. Preserves other MCP servers (chrome-devtools, viewgraph, etc.)
  - **Version update check** — fetches npm registry (3s timeout) and warns if a newer version is available
  - **`.gitignore` management** — adds `.tracepulse/` to .gitignore if not already present
  - **Prompt shortcuts** — installs `@tp-debug`, `@tp-health`, `@tp-test`, `@tp-diagnose`, `@tp-start` to `.kiro/prompts/`
  - **Content-based file comparison** — replaces unreliable mtime comparison for steering/hook updates. Files are now updated when content differs, regardless of filesystem timestamps.
  - **Hook routing fix** — `.kiro.hook` files now correctly install to `.kiro/hooks/` instead of `.kiro/steering/`
  - **Idempotent** — second run shows "Everything up to date" when nothing changed

---

## [0.9.23] - 2026-05-25

### Added
- **Shell misuse detection** — `get_session_insights` now always includes a `shell_misuse` section that flags shell calls matching test/build/lint patterns (pytest, vitest, tsc, eslint, uv build, cargo test, etc.). Reports violations with command, timestamp, and whether output was truncated via pipes. Always present in response (even when clean) as a passive deterrent.
- **Positive reinforcement nudges** — `run_and_watch`, `verify_build`, and `verify_loop` include a one-time `_tip` field on first successful use per session, reinforcing correct tool choice. Silent on subsequent calls to avoid token waste (~45 tokens max/session).
- **Output truncation detection** — shell commands piped through `| tail`, `| head`, or `| grep` are flagged as data loss indicators in the shell misuse report.

---

## [0.9.22] - 2026-05-19

### Added
- **`verify_loop(claim, since, fingerprint?)`** — composite fix verification. Checks new errors, pinned fingerprint resolved, build clean, HMR detected. Returns confidence-scored verdict (high/medium/low). Collapses 5-7 tool calls into 1.
- **`get_prompt_context(fingerprint)`** — pre-assembled, token-budgeted reasoning packet. Error + stack + surrounding logs + file snippet + git diff in one call.
- **`test_counts` in `run_and_watch` response** — structured `{passed, failed, skipped, warnings, total}` parsed from pytest/vitest/jest/go/cargo test output.
- **Auto-correlation in `get_errors`** — errors with file context are automatically enriched with `likely_cause` when the file was recently modified (git diff match).

---

## [0.9.21] - 2026-05-18

### Fixed
- **stop_server now actually kills the process** — previously only updated in-memory state without sending SIGTERM. Now wires through `onStopRequest` callback to `process-spawner.stop()` (SIGTERM → wait → SIGKILL). State only marked stopped on successful kill.
- **run_and_watch allowlist accepts env var prefixes** — commands like `PYTHONPATH=src uv run pytest` were rejected because the allowlist checked the first token (`PYTHONPATH=src`) instead of the actual command (`uv`). Now strips leading `KEY=val` assignments before checking. Emits a stderr hint suggesting the `env` parameter instead.

---

## [0.9.20] - 2026-05-17

### Fixed
- **run_and_watch timeout** — process group kill. Previously `child.kill("SIGTERM")` with `shell: true` only killed the shell wrapper, leaving the actual command (pytest, vitest) running indefinitely. Now spawns with `detached: true` and kills the entire process group via `process.kill(-pid)`. Includes 3s SIGKILL fallback.
- **free_port multi-PID** — `lsof` returns multiple PIDs when several processes listen on a port. Old code passed the multi-line string as a single argument to `kill`, failing silently. Now splits and kills each PID individually.

### Added
- **`tracepulse init` installs Kiro steering files** — re-running `init` on an existing project now installs/updates steering files from `skills/kiro-steering/` into `.kiro/steering/`. Uses mtime comparison so package upgrades propagate new rules.
- **Subagent tool rules steering file** — `tracepulse-subagent-rules.md` instructs agents to use `run_and_watch` instead of Shell for test/build/lint commands in subagent prompts.

### Changed
- Strengthened `run_and_watch` tool description: explicit "never fall back to shell" and timeout guidance.
- Strengthened `free_port` tool description: "do not use shell with lsof/kill".

---

## [0.9.18] - 2026-05-17

### Added
- **DevLoop Agent — Cross-Layer Correlation** (M24): `get_cross_layer_diagnosis` tool correlates backend logs, frontend errors, git state, and process state into actionable root-cause diagnoses
- **9 failure patterns**: backend-ok-frontend-error, stale-server, rate-limited, repeated-error, schema-validation, build-error-runtime, auth-expired, silent-failure, build-failed-silently
- **Signal aggregator**: collects signals from 4 layers (backend, frontend, git, process) into unified snapshots
- **Output gating** (quiet agent principle): 2-signal minimum before surfacing diagnoses to prevent alert fatigue
- **Confidence floor enforcement**: `proposed_fix` is null when confidence is below pattern's floor
- **Snapshot metadata**: `snapshot_timestamp`, `missing_signals`, `active_layers` in every response
- **Per-pattern `minSignals`**: unambiguous patterns (429, 422, 401) fire with 1 signal; cross-layer patterns require 2+
- **Frontend crash bridge classification**: React ErrorBoundary events correctly classified as frontend type-error signals
- **Integration test suite**: 7 real-world failure scenarios as regression tests
- 42 MCP tools total, 1064 tests passing

### Changed
- Updated all gitbook docs, README, and skill files to reflect 42 tools
- New gitbook feature page: Cross-Layer Diagnosis
- Rewritten three-layer-stack architecture page with real debugging scenarios
- 3 new SVG infographics (stack diagram, cross-layer flow, debugging scenario)

---

## [0.9.17] - 2026-05-16

### Added
- **Zero-config startup**: bare `tracepulse` (no args) starts in standalone mode with project detection
- **`start_server` tool**: start a dev server mid-session, activates Layer 2 tools dynamically
- **`stop_server` tool**: clean shutdown of managed servers
- **`tracepulse doctor`**: diagnostic command checking Node version, project detection, venv, persistence
- **`tracepulse analyze`**: CLI command for cross-session bug pattern analysis
- **Dynamic tool layers**: standalone shows 24 tools, start_server activates 16 more (40 total)
- **HTTP REST API** (5 endpoints): /health, /api/session, /api/errors, /api/metrics, /api/patterns
- **API key auth**: timing-safe comparison via TRACEPULSE_API_KEY env var
- **Rate limiting**: 60 req/min per client on REST endpoints
- **Dashboard manifest registration**: auto-registers with external dashboard via DASHBOARD_URL
- **Bug pattern detection** (6 types): recurring, velocity, chains, flaky, fixed-but-back, degradation
- **`get_bug_patterns` tool**: cross-session error intelligence with token cost estimates
- **Clustered mode** (`--clustered`): 39 tools collapse to 7 gateways + 2 standalone (80% schema reduction)
- **`max_lines` parameter** on run_and_watch: output truncation without shell pipes
- **`raw_output` field** in run_and_watch response
- **Compact field names** (`compactEvent`): 10-20% response size reduction
- **Semantic error grouping**: errors at same file:line collapsed with variant_count
- **Diff correlation cache**: cached for 30s after HMR events
- **Pre-spawn validation**: start_server detects shell syntax, missing deps before spawning
- **Startup diagnostics**: clear error messages when commands fail (shell syntax, missing modules, port conflicts)
- **Project detection**: 7 stack types (node, python, go, rust, java, infra, docker)
- **Start command suggestions**: reads package.json scripts, Makefile, scripts/*.sh, manage.py
- **Stack-aware allowlist**: Python project auto-allows pytest, uv, mypy, ruff, alembic
- **Usage nudge**: get_session_insights suggests run_and_watch when agent uses shell
- **Persistence as default**: opt-out via --no-persist (was opt-in)
- **Session history**: saves per-session fingerprints for pattern analysis
- **Claude Code support**: `skills/claude-rules/tracepulse.md` for `~/.claude/rules/`, `skills/CLAUDE.md` template
- **Cross-platform bin wrapper**: shell script (Unix) + .cmd (Windows) fixes npm global symlink ESM issue
- **Pre-commit hook**: blocks commits containing private project names

### Fixed
- **BUG-017**: standalone isConnected returned true (hid start_server suggestions)
- **BUG-018**: npm global symlink broke ESM import.meta.url resolution
- **BUG-019**: bin/ directory missing from npm package files array
- **VERSION drift**: now injected at build time via tsup define (reads from package.json)
- **run_and_watch cwd**: absolute paths now allowed (was rejecting cross-project paths)
- **run_and_watch venv**: auto-detects .venv/bin in cwd, prepends to PATH
- **Allowlist expanded**: added python, pnpm, bun, cargo build/check, mvn, gradle, make, cmake, alembic, django-admin

### Changed
- Persistence is now default (use --no-persist to disable)
- get_project_health is layer-aware (shows detected stacks, suggests start commands)
- start_server response includes next_steps array for error recovery guidance
- Error recovery ladder added to SKILL.md

### Documentation
- Installation pages rewritten for non-technical users
- Claude Code config path documented (`~/.claude.json` projects structure)
- CLI commands reference expanded (doctor, analyze, all flags)
- How It Works: 4 Mermaid diagrams replaced with SVGs
- All reference pages rewritten with human-friendly explanations
- 84 tool deep-links across 23 gitbook pages
- Schema reduction SVG updated for 39 tools
- Environmental impact SVG text clipping fixed
- Docs folder reorganized (audits/, feedback/, product/)
- Evolution timeline documenting every change back to its source
- Tech docs accessibility review prompt created

## [0.9.2] - 2026-04-30

### Added
- **4 new MCP tools**: get_error_clusters, get_migration_status, get_audit_trail, get_perf_baseline (30 total)
- **3 new parsers**: Celery, Sidekiq, BullMQ background worker parsers (23 total)
- **Error narratives**: 10 fix suggestion patterns (module not found, connection refused, missing migration, etc.) wired into get_error_context
- **ErrorBoundary crash bridge**: POST /api/v1/crashes endpoint + JS snippet for React crash reporting
- **Score decay**: transient 401/403/408/429 errors lose priority after 60s no recurrence
- **Error lifecycle manager**: auto-detect resolved errors, auto-expire HMR transients
- **run_and_watch cwd parameter**: working directory support for monorepos
- **Test runner summary parsing**: pytest/vitest/jest success summaries in structured output
- **Build warnings + stats**: get_build_errors now includes warnings and Vite module count
- **Previous session error details**: last_message loaded from fingerprint persistence

### Fixed (CRR-001 Code Review - 13 items)
- **TD-008**: Config loader wraps JSON.parse in try/catch - malformed config returns error instead of crashing
- **TD-009**: Secret redactor captures quoted values as a unit (`password = "my secret"` fully redacted)
- **TD-010**: Process spawner rejects start() on any non-zero exit code, not just 127
- **TD-011**: Pinned error eviction uses insertion-order list for O(1) instead of O(n log n) sort
- **TD-012**: Health prober timeout message preserved via timedOut flag (no longer overwritten by socket error)
- **TD-013**: Typed `createNoOpInfraMonitor()` factory replaces `as any` casts in server.ts
- **TD-014**: Config validator rejects unknown keys (catches typos like `correleation_window_ms`)
- **TD-015**: Log file tailer only ignores ENOENT, surfaces EACCES/ENOSPC to stderr
- **TD-016**: Fingerprinter LRU cache (256 entries) skips SHA-256 recomputation for repeated messages
- **TD-017**: Added GCP service account, Azure connection string, Datadog API key redaction patterns
- **TD-018**: Multi-process collector checks exitCode before registering exit listener (fixes race)
- **TD-019**: EADDRINUSE error suggests alternate port instead of opaque Node.js error
- **TD-020**: Rate limiter uses proportional token refill instead of fixed-window reset

### Added (post-v0.8.1)

- **`register_probe` + `list_probes` tools** (25th, 26th tools) - agent-generated health probes
- **`get_infra_status` + `get_infra_detail` tools** - infrastructure discovery from .env with TCP/HTTP probing
- **`get_project_health` tool** - composite: server + infra + errors + build in one call
- **`check_port` tool** - TCP port availability check
- **`restart_server` tool** - kill and respawn dev server with auto-clear and cooldown
- **`get_requests` tool** - HTTP request query by path and status
- **npm audit parser, coverage parser** (19th, 20th parsers)
- **vitest parser, Go test parser** (17th, 18th parsers)
- **Build stats parser** - Vite module count, build time
- **Crash loop detector** - 3+ restarts in 60s = alert
- **Infrastructure error patterns** - 27 patterns (DB, network, memory, disk, Redis, TLS, DNS, migration)
- **Pinned errors** - high-signal errors survive ring buffer eviction
- **Debounced build errors** - opt-in 2s persistence filter
- **File change tracker** - correlates hot-reload events with file paths
- **Previous session error details** - last_message in fingerprint persistence
- **Browser error capture skill** (10th skill)
- **Server management skill** (9th skill)
- **Auto-clear buffer on restart_server**
- **Pre-existing error count** in watch_for_errors response
- **Old vs new error distinction** in get_health_summary
- **Migration error suggestions** - "Run pending migrations"
- **Debugging loop** documented in SKILL.md and GitBook

### Security

- **SRR-002:** SSRF fix on register_probe (localhost-only URLs)
- **SRR-002:** Shell chaining fix on run_and_watch (metacharacter rejection)
- **SRR-002:** Restart cooldown (5s between restarts)

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
