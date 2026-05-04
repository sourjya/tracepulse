# CRR-001 — 2026-04-30 — Full Codebase Review

**Scope:** Full codebase fresh-eyes review — security, performance, maintainability, edge cases
**Version at review:** v0.9.2 (post-M11, pre-M12)
**Files reviewed:** 99 TypeScript source files across 15 subsystems
**Tech debt items created:** TD-008 through TD-020

---

## Findings Summary

| Severity | Count | Tech Debt IDs |
|----------|-------|---------------|
| Fix Now (pre-release blocker) | 3 | TD-008, TD-009, TD-010 |
| High | 3 | TD-011, TD-012, TD-013 |
| Medium | 4 | TD-014, TD-015, TD-016, TD-017 |
| Low | 3 | TD-018, TD-019, TD-020 |

---

## Fix Now — Pre-Release Blockers

### CRR-001-A: Config JSON.parse crashes on malformed file
**TD:** TD-008
**File:** `src/config/config-loader.ts:80,84`

Both `JSON.parse` calls are outside any try/catch. A malformed `tracepulse.config.json` (invalid JSON syntax, not just invalid values) throws a raw `SyntaxError` and crashes the process. The function signature promises `ConfigValidationResult` but instead aborts.

**Expected:** Return `{ valid: false, error: "Config file contains invalid JSON: ..." }`.

---

### CRR-001-B: Secret redactor stops at first whitespace in quoted values
**TD:** TD-009
**File:** `src/constants/redaction.ts:62`

The `key-value-secret` pattern uses `\S+` as the value matcher:
```
/(?:password|...|client_secret)\s*[=:]\s*\S+/gi
```
`\S+` stops at the first whitespace character. A value like `password = "my secret phrase"` only redacts `"my` — the remainder leaks into the pipeline and MCP tool responses. Quoted values (single or double) must be captured as a unit.

**Expected:** Value side should match `(?:"[^"]*"|'[^']*'|\S+)`.

---

### CRR-001-C: Process spawner reports success for fast-failing commands
**TD:** TD-010
**File:** `src/collectors/process-spawner.ts:131,164-169`

Only exit code `127` (command not found) causes `start()` to reject. Any other non-zero exit code — e.g., `1` from `npm run dev` when `node_modules` is missing — before the 500ms timeout resolves as success. The CLI believes the process started and the agent operates with a dead server.

**Expected:** Any non-zero exit code before the 500ms settled window should reject `start()`.

---

## High

### CRR-001-D: Pinned error eviction is O(n log n) on the push hot path
**TD:** TD-011
**File:** `src/store/ring-buffer.ts:173`

```ts
const oldest = [...pinnedErrors.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
```
Called on every high-signal push when `pinnedErrors.size > MAX_PINNED (50)`. Spreads all 51 map entries into an array and sorts on the event loop hot path.

**Expected:** Maintain a separate insertion-order list alongside `pinnedErrors` for O(1) eviction.

---

### CRR-001-E: Health prober timeout message overwritten by destroy()
**TD:** TD-012
**File:** `src/infra/health-prober.ts:66-73`

`req.destroy()` on timeout triggers Node.js to emit an `error` event on the request (ECONNRESET or similar). The error handler then overwrites `lastResult` from `{ status: "unreachable", error: "timeout after 5s" }` to `{ status: "unreachable", error: "socket hang up" }`. The timeout context is lost, making probe diagnostics misleading.

**Expected:** Guard the error handler with a `timedOut` flag; if already timed out, skip the error handler.

---

### CRR-001-F: `as any` no-op InfraMonitor bypasses compile-time safety
**TD:** TD-013
**File:** `src/mcp/server.ts:507,518`; `src/cli.ts:451,452`

Two inline no-op fallback objects for the optional `infraMonitor` dependency are cast to `any`. If `InfraMonitor` gains a new required method, these fallbacks won't produce compile errors and will throw at runtime. Also `cli.ts:451-452` monkey-patches a Collector via `as any` during hot-reload.

**Expected:** Extract a typed `createNoOpInfraMonitor(): InfraMonitor` factory used in both sites; fix collector monkey-patch by using the proper interface.

---

## Medium

### CRR-001-G: Config validator silently ignores unknown keys
**TD:** TD-014
**File:** `src/config/config-schema.ts:65-108`

`validateConfig()` casts `raw` to `TracePulseConfig` and only validates known fields. A user typo like `correleation_window_ms` is silently accepted with default behavior applied — no warning emitted.

**Expected:** Check `Object.keys(raw)` against the known top-level key allowlist; return `{ valid: false, error: "Unknown config key: 'correleation_window_ms'" }`.

---

### CRR-001-H: Log file tailer silently drops all I/O errors
**TD:** TD-015
**File:** `src/collectors/log-file-tailer.ts:87-89`

The catch block in `readNewLines()` swallows every exception with "// File may have been deleted". `EACCES` (permission denied) and `ENOSPC` (disk full) are treated identically to ENOENT — all silently swallowed.

**Expected:** Only ignore ENOENT; write other error codes to stderr so the user knows something is wrong.

---

### CRR-001-I: SHA-256 + 5 regex passes computed for every event before dedup check
**TD:** TD-016
**File:** `src/pipeline/fingerprinter.ts:53-82`

`fingerprint()` runs 5 regex replacements and a full SHA-256 hash for every incoming event. The ring buffer's dedup check happens *after* fingerprinting, meaning duplicate events (the common case under sustained errors) pay the full normalization cost repeatedly.

**Expected:** Add a small LRU cache (e.g., 256-entry Map) keyed on raw message; on cache hit, skip normalization and hash recomputation.

---

### CRR-001-J: Redactor missing GCP, Azure, and Datadog credential formats
**TD:** TD-017
**File:** `src/constants/redaction.ts`

No patterns for:
- GCP service account JSON (identifiable by `"type":"service_account"` or `"private_key_id":`)
- Azure storage connection strings (`DefaultEndpointsProtocol=https;AccountKey=...`)
- Datadog API keys (`DD_API_KEY`, `dd_` prefixed keys)

These formats appear frequently in microservice log output and would leak through the current redactor.

---

## Low

### CRR-001-K: Multi-process collector stop() has a narrow exit-race
**TD:** TD-018
**File:** `src/collectors/multi-process-collector.ts:115`

If a child process exits between when `stop()` begins iterating `children` and when `child.on("exit")` is registered, the exit event already fired and won't re-fire. The kill promise hangs until the `GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS` safety timer fires. Narrow window but possible under high load.

**Expected:** Check `child.exitCode !== null` before registering the exit listener; resolve immediately if already exited.

---

### CRR-001-L: HTTP transport gives opaque EADDRINUSE error
**TD:** TD-019
**File:** `src/transport/http-transport.ts:59-64`

When the configured port is already in use, the user sees a raw Node.js error message. No actionable suggestion is provided.

**Expected:** Check `(err as NodeJS.ErrnoException).code === 'EADDRINUSE'` and print `"Port ${port} is already in use. Try --http-port ${port + 1}"`.

---

### CRR-001-M: Rate limiter uses fixed window, allowing 2× burst at boundary
**TD:** TD-020
**File:** `src/correlation/sources/log-collector.ts:65-74`

The token bucket resets fully at each 1s boundary. Sending 100 requests at t=999ms and 100 at t=1001ms both pass — 200 requests in ~2ms. This is standard fixed-window limiting, not true token bucket. Low risk for a localhost dev tool but worth noting.

**Expected:** Refill proportionally to elapsed time rather than resetting fully at each interval boundary.

---

## Not Actioned (considered and dismissed)

- **JWT redaction pattern anchoring**: The `eyJ` prefix is sufficiently distinctive; no false negatives observed in practice.
- **Correlation engine double-sort**: The sort is on `readonly RuntimeEvent[]`, O(n log n) on small sets (≤500 events). Not a bottleneck.
- **`void readNewLines()` in log tailer**: Errors are already caught inside `readNewLines()`; the `void` is intentional and correct. See TD-015 for the related inner-catch issue.
- **Line accumulator MAX_BUFFER_LINES flush**: Intentional fallback; documented behavior acceptable.
