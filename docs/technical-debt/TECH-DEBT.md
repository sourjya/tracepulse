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

## TD-002: Phase 3-5 tools conditionally registered based on optional dependencies

**Added:** 2026-04-28
**Severity:** Low
**Affects:** `createMcpServer` in `src/mcp/server.ts`

**Current state:** `list_services`, `get_correlated_errors`, `get_new_errors`, and `get_error_trends` are only registered when their dependencies (registry, frontendBuffer, fingerprintHistory) are passed in the options object. If not passed, those tools simply don't appear.

**Problem:** An agent might expect a tool to exist based on the SKILL.md documentation but not find it because the CLI didn't pass the dependency. No error message explains why.

**Fix:** Always register all tools. Tools that lack dependencies should return a clear message like `"list_services requires multi-process mode (--service or --config)"` instead of being invisible.

---

## TD-003: Multi-process collector doesn't tag events with service name in the RuntimeEvent

**Added:** 2026-04-28
**Severity:** Medium
**Affects:** `src/collectors/multi-process-collector.ts`

**Current state:** The multi-process collector passes the service name as a third argument to the `onLine` callback, but the pipeline's `createPipeline` function in `cli.ts` ignores it - it only takes `(source, line)`. Events enter the buffer with `service: "main"` regardless of which service produced them.

**Fix:** Extend `createPipeline` to accept and forward the service name, or have the multi-process collector set the service name on the RuntimeEvent after normalization.

---

## TD-004: ESLint config needs migration to v9 flat config format

**Added:** 2026-04-28
**Severity:** Low
**Affects:** `npm run lint`

**Current state:** ESLint v9 is installed but no `eslint.config.js` exists. Running `npm run lint` fails with a config-not-found error. Linting is effectively disabled.

**Fix:** Create `eslint.config.js` with flat config format, migrate rules from any `.eslintrc` that may have existed.

---

## TD-005: Intermittent multi-process collector test failure

**Added:** 2026-04-28
**Severity:** Low
**Affects:** `tests/unit/collectors/multi-process-collector.test.ts`

**Current state:** The "child process exit with non-zero code sets service status to crashed" test occasionally fails when run in parallel with other test files. Passes consistently when run alone.

**Problem:** Timing-sensitive test that uses real child processes with `setTimeout` waits. Under parallel test load, the 1500ms wait isn't always enough.

**Fix:** Use vitest's `--pool=forks` for this test file, or increase the timeout, or mock the child process spawning.

---

## TD-006: `hot_reload_detected` returns `false` in attach mode instead of `null`

**Added:** 2026-04-28
**Severity:** Medium
**Affects:** `watch_for_errors` MCP tool

**Current state:** `hot_reload_detected` is always `true` or `false`. In attach mode (tailing a log file), TracePulse may not see hot-reload messages because they go to a different process's stdout (e.g., Vite frontend vs Python backend). The agent gets `false` and thinks "no reload happened" when the truth is "I don't know - I can't see that process."

**Problem:** `false` means "definitely no reload" but the actual state is "unknown." This misleads the agent.

**Fix:** Return `hot_reload_detected: null` when TracePulse is in attach mode or when it has no visibility into the dev server's stdout. Only return `true`/`false` in start mode where TracePulse owns the process. Also include `hmr_events_seen: []` with matched pattern details when hot-reload IS detected.

---

## TD-007: `watch_for_errors` doesn't report which HMR events were seen

**Added:** 2026-04-28
**Severity:** Low
**Affects:** `watch_for_errors` MCP tool

**Current state:** `hot_reload_detected` is a boolean. When `true`, the agent doesn't know which tool reloaded or which files triggered it.

**Fix:** Add `hmr_events: Array<{ tool: string, pattern_id: string, line: string }>` to the watch result. Populated from the synthetic hot-reload events collected during the watch window.
