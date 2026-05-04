# Technical Debt

Known shortcuts and items to fix before v1.0.0.

---

## TD-001: ~~`get_errors` returns a plain array instead of a structured response object~~

**Added:** 2026-04-28
**Resolved:** 2026-04-28
**Severity:** HIGH - agent requested freshness metadata on `get_errors` three times in one session
**Affects:** `get_errors` MCP tool

**Resolution:** Changed `get_errors` to return `{ errors: [...], total_matching, session_started_at, oldest_event_at, buffer_cleared_at }`. Updated all 7 test files (20 assertions). SKILL.md updated to document the new response format.

**Current state:** `get_errors` returns a raw JSON array of RuntimeEvents. All other tools (`get_build_errors`, `get_runtime_status`, `get_timeline`, etc.) return structured objects with metadata fields.

**Problem:** The agent can't get freshness context (session start time, buffer cleared time, oldest event timestamp) from `get_errors` without making a separate `get_runtime_status` call. This is a workaround - the agent has to call two tools instead of one.

**Why it's like this:** Many existing tests (7+ test files) parse the `get_errors` response as a plain array. Wrapping it in `{ errors: [...], session_started_at, oldest_event_at, buffer_cleared_at }` would break all of them.

**Fix:** Change `get_errors` to return a structured object like all other tools. Update all tests that parse the response. This is a breaking change to the tool response format, so it should be done in a single coordinated change.

**Workaround:** Agent calls `get_runtime_status()` first to get `session_started_at`, then `get_errors()` for the error list.

---

## TD-002: ~~Phase 3-5 tools conditionally registered based on optional dependencies

**Added:** 2026-04-28
**Severity:** Low
**Affects:** `createMcpServer` in `src/mcp/server.ts`

**Current state:** `list_services`, `get_correlated_errors`, `get_new_errors`, and `get_error_trends` are only registered when their dependencies (registry, frontendBuffer, fingerprintHistory) are passed in the options object. If not passed, those tools simply don't appear.

**Problem:** An agent might expect a tool to exist based on the SKILL.md documentation but not find it because the CLI didn't pass the dependency. No error message explains why.

**Fix:** Always register all tools. Tools that lack dependencies should return a clear message like `"list_services requires multi-process mode (--service or --config)"` instead of being invisible.

---

## TD-003: ~~Multi-process collector doesn't tag events with service name in the RuntimeEvent

**Added:** 2026-04-28
**Severity:** Medium
**Affects:** `src/collectors/multi-process-collector.ts`

**Current state:** The multi-process collector passes the service name as a third argument to the `onLine` callback, but the pipeline's `createPipeline` function in `cli.ts` ignores it - it only takes `(source, line)`. Events enter the buffer with `service: "main"` regardless of which service produced them.

**Fix:** Extend `createPipeline` to accept and forward the service name, or have the multi-process collector set the service name on the RuntimeEvent after normalization.

---

## TD-004: ~~ESLint config needs migration to v9 flat config format

**Added:** 2026-04-28
**Severity:** Low
**Affects:** `npm run lint`

**Current state:** ESLint v9 is installed but no `eslint.config.js` exists. Running `npm run lint` fails with a config-not-found error. Linting is effectively disabled.

**Fix:** Create `eslint.config.js` with flat config format, migrate rules from any `.eslintrc` that may have existed.

---

## TD-005: ~~Intermittent multi-process collector test failure

**Added:** 2026-04-28
**Severity:** Low
**Affects:** `tests/unit/collectors/multi-process-collector.test.ts`

**Current state:** The "child process exit with non-zero code sets service status to crashed" test occasionally fails when run in parallel with other test files. Passes consistently when run alone.

**Problem:** Timing-sensitive test that uses real child processes with `setTimeout` waits. Under parallel test load, the 1500ms wait isn't always enough.

**Fix:** Use vitest's `--pool=forks` for this test file, or increase the timeout, or mock the child process spawning.

---

## TD-006: ~~`hot_reload_detected` returns `false` in attach mode instead of `null`

**Added:** 2026-04-28
**Severity:** Medium
**Affects:** `watch_for_errors` MCP tool

**Current state:** `hot_reload_detected` is always `true` or `false`. In attach mode (tailing a log file), TracePulse may not see hot-reload messages because they go to a different process's stdout (e.g., Vite frontend vs Python backend). The agent gets `false` and thinks "no reload happened" when the truth is "I don't know - I can't see that process."

**Problem:** `false` means "definitely no reload" but the actual state is "unknown." This misleads the agent.

**Fix:** Return `hot_reload_detected: null` when TracePulse is in attach mode or when it has no visibility into the dev server's stdout. Only return `true`/`false` in start mode where TracePulse owns the process. Also include `hmr_events_seen: []` with matched pattern details when hot-reload IS detected.

---

## TD-007: ~~`watch_for_errors` doesn't report which HMR events were seen

**Added:** 2026-04-28
**Severity:** Low
**Affects:** `watch_for_errors` MCP tool

**Current state:** `hot_reload_detected` is a boolean. When `true`, the agent doesn't know which tool reloaded or which files triggered it.

**Fix:** Add `hmr_events: Array<{ tool: string, pattern_id: string, line: string }>` to the watch result. Populated from the synthetic hot-reload events collected during the watch window.

---

<!-- ═══════════════════════════════════════════════════════════════
     CRR-001 (2026-04-30) — Full Codebase Review findings
     See docs/audits/code-review/CRR-001-2026-04-30-full-review.md
     ═══════════════════════════════════════════════════════════════ -->

## TD-008: ~~Config JSON.parse crashes on malformed config file - RESOLVED~~

**Added:** 2026-04-30
**Severity:** HIGH — pre-release blocker
**Affects:** `src/config/config-loader.ts:80,84`
**Review:** CRR-001-A

Both `JSON.parse` calls in `loadConfig()` are outside any try/catch. A syntactically invalid `tracepulse.config.json` throws a raw `SyntaxError` that propagates uncaught and crashes the process. The function is supposed to return `ConfigValidationResult` for all failure cases.

**Fix:** Wrap both `JSON.parse` calls in try/catch; return `{ valid: false, error: "Config file contains invalid JSON: <msg>" }`.

---

## TD-009: ~~Secret redactor stops at first whitespace in quoted values - RESOLVED~~

**Added:** 2026-04-30
**Severity:** HIGH — pre-release blocker (security)
**Affects:** `src/constants/redaction.ts:62`
**Review:** CRR-001-B

The `key-value-secret` pattern uses `\S+` as the value matcher, which stops at the first space. `password = "my secret phrase"` only redacts `"my` — the rest leaks through to MCP tool responses.

**Fix:** Change value side from `\S+` to `(?:"[^"]*"|'[^']*'|\S+)` to handle quoted values.

---

## TD-010: ~~Process spawner reports `connected: true` for fast-failing commands - RESOLVED~~

**Added:** 2026-04-30
**Severity:** HIGH — pre-release blocker
**Affects:** `src/collectors/process-spawner.ts:131,164-169`
**Review:** CRR-001-C

Only exit code `127` (command not found) triggers rejection. Any other non-zero exit code before the 500ms settled window (e.g., `npm run dev` with missing node_modules exiting with code `1`) resolves `start()` as success. The CLI and the agent believe the process is running when it is already dead.

**Fix:** Reject `start()` on any non-zero exit code seen before `settled = true`, not just code 127.

---

## TD-011: ~~Pinned error eviction is O(n log n) on the push hot path - RESOLVED~~

**Added:** 2026-04-30
**Severity:** HIGH
**Affects:** `src/store/ring-buffer.ts:173`
**Review:** CRR-001-D

When `pinnedErrors.size > MAX_PINNED (50)`, the eviction logic spreads all entries into an array and sorts them on every high-signal push. This runs on the event-loop hot path for every unique high-signal error.

**Fix:** Maintain a separate insertion-ordered array alongside `pinnedErrors`; O(1) eviction by shifting the front of the array.

---

## TD-012: ~~Health prober timeout message overwritten by `req.destroy()` error event - RESOLVED~~

**Added:** 2026-04-30
**Severity:** HIGH
**Affects:** `src/infra/health-prober.ts:66-73`
**Review:** CRR-001-E

`req.destroy()` called in the timeout handler causes Node.js to emit an `error` event. The error handler overwrites `lastResult` from `"timeout after 5s"` to `"socket hang up"`, losing the timeout diagnostic context.

**Fix:** Add `let timedOut = false` flag; set before `req.destroy()`; guard error handler to return early if `timedOut`.

---

## TD-013: ~~`as any` no-op InfraMonitor bypasses compile-time safety - RESOLVED~~

**Added:** 2026-04-30
**Severity:** HIGH
**Affects:** `src/mcp/server.ts:507,518`; `src/cli.ts:451,452`
**Review:** CRR-001-F

Two inline no-op fallbacks for the optional `infraMonitor` are cast to `any`. Future changes to the `InfraMonitor` interface won't produce compile errors at these sites. Also, `cli.ts:451-452` monkey-patches a Collector via `as any` during hot-reload restart.

**Fix:** Extract `createNoOpInfraMonitor(): InfraMonitor` factory; use it in both server.ts sites. Fix the collector patch to use a proper typed wrapper.

---

## TD-014: ~~Config validator silently ignores unknown keys - RESOLVED~~

**Added:** 2026-04-30
**Severity:** MEDIUM
**Affects:** `src/config/config-schema.ts:65-108`
**Review:** CRR-001-G

`validateConfig()` only checks known fields. An unknown or mistyped key (e.g., `correleation_window_ms`) is silently accepted; the default behaviour applies with no warning.

**Fix:** Add allowlist check over `Object.keys(raw)`; return validation error listing the unexpected key.

---

## TD-015: ~~Log file tailer swallows all I/O errors including non-ENOENT - RESOLVED~~

**Added:** 2026-04-30
**Severity:** MEDIUM
**Affects:** `src/collectors/log-file-tailer.ts:87-89`
**Review:** CRR-001-H

The catch block in `readNewLines()` silently ignores every exception. `EACCES` (permission denied) and `ENOSPC` (disk full) are treated identically to ENOENT.

**Fix:** Check error code; only suppress `ENOENT`; write other error codes to stderr.

---

## TD-016: ~~Fingerprinter recomputes SHA-256 + 5 regexes for every event before dedup - RESOLVED~~

**Added:** 2026-04-30
**Severity:** MEDIUM
**Affects:** `src/pipeline/fingerprinter.ts:53-82`
**Review:** CRR-001-I

`fingerprint()` runs 5 regex replacements and a SHA-256 hash before the ring buffer's dedup check. Duplicate events (the common case under sustained errors) pay the full normalization cost on every occurrence.

**Fix:** Add a small LRU cache (256-entry Map keyed on raw message) in the normalizer; skip recomputation on cache hit.

---

## TD-017: ~~Redactor missing GCP, Azure, and Datadog credential formats - RESOLVED~~

**Added:** 2026-04-30
**Severity:** MEDIUM (security)
**Affects:** `src/constants/redaction.ts`
**Review:** CRR-001-J

No patterns for GCP service account JSON (`"type":"service_account"`, `"private_key_id":`), Azure connection strings (`DefaultEndpointsProtocol=https;AccountKey=...`), or Datadog API keys (`DD_API_KEY` / `dd_` prefix). These appear frequently in microservice log output.

**Fix:** Add regex patterns for each format in `REDACTION_PATTERNS`.

---

## TD-018: ~~Multi-process collector stop() has a narrow exit-race - RESOLVED~~

**Added:** 2026-04-30
**Severity:** LOW
**Affects:** `src/collectors/multi-process-collector.ts:115`
**Review:** CRR-001-K

If a child process exits between when `stop()` begins iterating `children` and when `child.on("exit")` is registered, the exit event already fired. The kill promise then hangs until the `GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS` safety timer resolves it.

**Fix:** Check `child.exitCode !== null` before registering the exit listener; resolve immediately if already exited.

---

## TD-019: ~~HTTP transport gives opaque EADDRINUSE error - RESOLVED~~

**Added:** 2026-04-30
**Severity:** LOW
**Affects:** `src/transport/http-transport.ts:59-64`
**Review:** CRR-001-L

Port-in-use errors surface as a raw Node.js message with no actionable suggestion.

**Fix:** Check `(err as NodeJS.ErrnoException).code === 'EADDRINUSE'`; print `"Port ${port} is already in use. Try --http-port ${port + 1}"`.

---

## TD-020: ~~Rate limiter uses fixed window, allowing 2× burst at boundary - RESOLVED~~

**Added:** 2026-04-30
**Severity:** LOW
**Affects:** `src/correlation/sources/log-collector.ts:65-74`
**Review:** CRR-001-M

Sending 100 requests at t=999ms and 100 at t=1001ms both pass the rate limiter (200 in ~2ms). Full token reset at each window boundary rather than proportional refill.

**Fix:** Refill tokens proportionally to elapsed time: `tokenCount = Math.min(RATE_LIMIT, tokenCount + (elapsed / REFILL_INTERVAL_MS) * RATE_LIMIT)`.
