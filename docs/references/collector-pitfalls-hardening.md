# Collector Pitfalls & Hardening Guide

**Date:** 2026-04-27
**Purpose:** Catalog every known failure mode, edge case, and common pitfall for TracePulse's collectors (process spawning, log file tailing, stdio MCP transport) based on deep research across Node.js issues, StackOverflow, GitHub bug reports, MCP community reports, and log aggregation literature. Each pitfall includes the root cause, how it manifests, and the defensive code pattern to prevent it.

---

## Table of Contents

1. [Process Spawner Pitfalls](#1-process-spawner-pitfalls)
2. [Log File Tailer Pitfalls](#2-log-file-tailer-pitfalls)
3. [MCP stdio Transport Pitfalls](#3-mcp-stdio-transport-pitfalls)
4. [Error Parsing Pitfalls](#4-error-parsing-pitfalls)
5. [Signal Handling & Shutdown Pitfalls](#5-signal-handling--shutdown-pitfalls)
6. [Cross-Cutting Concerns](#6-cross-cutting-concerns)
7. [Hardening Checklist](#7-hardening-checklist)

---

## 1. Process Spawner Pitfalls

### 1.1 Child Process Output Buffering (Block Buffering vs Line Buffering)

**Root cause:** When a process's stdout is connected to a pipe (not a TTY), most C runtimes (glibc, musl) switch from line-buffered to block-buffered output (typically 4KB or 8KB blocks). This means the child process's output arrives in large delayed chunks instead of line-by-line.

**Affected languages:**
- **Python:** stdout is block-buffered when piped. Fix: `PYTHONUNBUFFERED=1` env var or `python -u` flag.
- **Ruby:** stdout is block-buffered when piped. Fix: `STDOUT.sync = true` or `stdbuf -oL ruby script.rb`.
- **Go:** `fmt.Println` is unbuffered by default (writes directly to fd), but `bufio.Writer` wrapping stdout will block-buffer.
- **Java:** `System.out.println` auto-flushes on newline, but `PrintWriter` without autoFlush does not.
- **Node.js:** `console.log` is unbuffered to pipes (writes synchronously). Not affected.

**How it manifests in TracePulse:** The agent calls `get_errors` after a code change, but the dev server's error output hasn't arrived yet because it's sitting in the child process's internal buffer. The agent sees "no errors" and thinks the fix worked.

**Defensive pattern:**
```typescript
// Set PYTHONUNBUFFERED for Python dev servers
const env = { ...process.env, PYTHONUNBUFFERED: '1' };
spawn(command, { shell: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
```

**Status:** ⚠️ NOT YET IMPLEMENTED — need to set `PYTHONUNBUFFERED=1` and `STDBUF` hints in the spawner environment.

### 1.2 Zombie and Orphan Processes

**Root cause:** When `shell: true` is used, Node.js spawns `/bin/sh -c "command"`. The shell is the direct child; the actual dev server is a grandchild. Killing the shell (direct child) does NOT automatically kill the grandchild on all platforms.

**How it manifests:** TracePulse exits, but the dev server keeps running in the background. Port stays occupied. User gets "EADDRINUSE" on next start.

**Defensive patterns:**
- `detached: true` + `process.kill(-pid, signal)` kills the entire process group (shell + children). **Already implemented.**
- On Linux, `prctl(PR_SET_PDEATHSIG)` makes the child die when the parent dies — not available from Node.js directly.
- Fallback: on `beforeExit`, scan for child PIDs via `/proc` or `pgrep -P` and kill them.

**Status:** ✅ Partially handled (process group kill). ⚠️ Edge case: if the dev server itself spawns background workers (e.g., webpack workers), those may escape the process group.

### 1.3 stdout/stderr Ordering Not Guaranteed

**Root cause:** stdout and stderr are separate pipes with separate kernel buffers. The OS schedules reads from each pipe independently. When a child writes to both stdout and stderr in rapid succession, the parent may receive them in a different order than they were written.

**Source:** [nodejs/node#26516](https://github.com/nodejs/node/issues/26516) — "Order of stdout and stderr events not maintained."

**How it manifests:** A stack trace that spans stdout and stderr (some frameworks write the error message to stderr and the stack trace to stdout, or vice versa) arrives interleaved. The parser sees partial data and fails to match.

**Defensive pattern:** Timestamp each line on arrival and sort by arrival time when presenting to the agent. Accept that perfect ordering is impossible across two pipes.

**Status:** ✅ Already handled — each line gets `Date.now()` timestamp on arrival. Ring buffer sorts by timestamp.

### 1.4 Partial Lines at Stream Boundaries

**Root cause:** The `data` event on a stream delivers arbitrary chunks, not lines. A single `data` event may contain half a line, multiple lines, or a line split across two events.

**How it manifests:** The parser receives `"TypeError: Cannot read prop"` in one chunk and `"erties of undefined\n    at foo.js:42"` in the next. Without line splitting, the parser sees garbage.

**Defensive pattern:** Use `readline.createInterface()` which handles line splitting internally, buffering partial lines until a newline arrives.

**Status:** ✅ Already implemented — using `readline.createInterface` on both stdout and stderr.

### 1.5 maxBuffer Exceeded (exec, not spawn)

**Root cause:** `child_process.exec()` buffers ALL output in memory before returning. For long-running dev servers, this quickly exceeds the default 1MB limit.

**How it manifests:** `Error: stdout maxBuffer exceeded` crash.

**Defensive pattern:** Use `spawn()` (streaming) instead of `exec()` (buffering). Never use `exec` for long-running processes.

**Status:** ✅ Already correct — using `spawn()`.

### 1.6 Command Not Found Detection Race

**Root cause:** With `shell: true`, the shell process spawns successfully (the `spawn` event fires), but then the shell discovers the command doesn't exist and exits with code 127. There's a race between the `spawn` event (which would resolve the start promise) and the `close` event with code 127 (which should reject it).

**How it manifests:** `start()` resolves successfully, then the process immediately exits. The agent thinks the dev server is running.

**Defensive pattern:** Wait a short delay after `spawn` before resolving, giving the shell time to fail. Listen for `close` with code 127 during this window.

**Status:** ✅ Implemented with 500ms delay. ⚠️ Could be more robust — consider listening for the first line of output as the "alive" signal instead of a fixed timeout.

### 1.7 Shell Injection via Command String

**Root cause:** `shell: true` passes the command string directly to `/bin/sh -c`. If the command contains user-controlled input, it's vulnerable to shell injection.

**How it manifests:** A malicious MCP config like `"start": "npm run dev; rm -rf /"` would execute both commands.

**Defensive pattern:** The command comes from the user's own MCP config (they control their own machine), so this is accepted risk. Document that the command is executed in a shell. Do NOT accept commands from MCP tool calls.

**Status:** ✅ Acceptable — command comes from CLI args, not from agent input.

### 1.8 Very Long Lines (Binary Output, Minified JS)

**Root cause:** Some dev servers output extremely long lines — minified JavaScript bundles, base64-encoded data, binary data that happens to not contain newlines.

**How it manifests:** readline buffers the entire line in memory. A single 100MB line would consume 100MB of heap. The parser then tries to regex-match against this enormous string, potentially causing catastrophic backtracking.

**Defensive pattern:** Impose a maximum line length. If a line exceeds the limit, truncate it before parsing.

**Status:** ⚠️ NOT YET IMPLEMENTED — need to add a line length guard in the pipeline before parsing. The `raw` field is truncated to 1000 chars, but the parser still receives the full line.

---

## 2. Log File Tailer Pitfalls

### 2.1 fs.watch Fires Duplicate Events

**Root cause:** On macOS (FSEvents) and some Linux filesystems, `fs.watch` fires the callback twice for a single file modification. This is a known, documented Node.js behavior.

**Source:** [StackOverflow: fs.watch fired twice](https://stackoverflow.com/questions/12978924/fs-watch-fired-twice-when-i-change-the-watched-file) — "The fs.watch api is unstable and has known 'behaviour' with regards repeated notifications."

**How it manifests:** The tailer reads the same new bytes twice, producing duplicate events in the ring buffer.

**Defensive pattern:** Debounce the watch callback (e.g., 50ms). Or track the file position and only read bytes beyond the last known position — if position hasn't changed, skip.

**Status:** ⚠️ PARTIALLY HANDLED — we track file position, so re-reading the same position returns no new bytes. But rapid duplicate events could cause unnecessary I/O.

### 2.2 fs.watch Doesn't Work on Network Filesystems (NFS, SMB, Docker Volumes)

**Root cause:** `fs.watch` relies on OS-level filesystem notifications (inotify on Linux, FSEvents on macOS, ReadDirectoryChangesW on Windows). Network filesystems and some Docker volume mounts don't propagate these notifications.

**How it manifests:** The tailer starts but never receives any change events. The agent sees no logs.

**Defensive pattern:** Fall back to polling (`fs.watchFile` or manual `stat()` polling at 1-second intervals) when `fs.watch` doesn't fire within a reasonable time. Or detect Docker/NFS mounts and use polling from the start.

**Status:** ⚠️ NOT YET IMPLEMENTED — current implementation relies solely on `fs.watch`. Should add polling fallback.

### 2.3 Log Rotation: rename vs copytruncate

**Root cause:** Log rotation tools use two strategies:
- **rename** (default logrotate): renames `app.log` to `app.log.1`, creates new `app.log`. The tailer's file descriptor still points to the old (renamed) file.
- **copytruncate**: copies `app.log` to `app.log.1`, then truncates `app.log` to zero bytes. The tailer's file descriptor still points to the same file, but the content is gone.

**How it manifests:**
- With rename: tailer keeps reading the old file (now `app.log.1`), misses all new logs in the new `app.log`.
- With copytruncate: tailer detects file size decrease (truncation), resets position to 0. This works correctly.

**Defensive pattern:** Detect inode changes (the file at the path now has a different inode than the one we have open). Re-open the file when the inode changes.

**Status:** ⚠️ PARTIALLY HANDLED — truncation detection works (size decrease). Rename-based rotation is NOT detected (inode change detection not implemented).

### 2.4 File Doesn't Exist Yet on Start

**Root cause:** The dev server hasn't started writing logs yet when TracePulse starts in attach mode.

**How it manifests:** `ENOENT` error on open.

**Defensive pattern:** Watch the parent directory for file creation. Timeout after 30 seconds.

**Status:** ✅ Implemented with directory watching and 30s timeout.

### 2.5 Symlink Target Changes

**Root cause:** Some logging setups use a symlink (`current.log` → `app-2026-04-27.log`). When the log rotates, the symlink target changes. `fs.watch` on the symlink may not detect this.

**How it manifests:** Tailer keeps reading the old target file, misses new logs.

**Defensive pattern:** Resolve symlinks on start and periodically re-resolve to detect target changes.

**Status:** ❌ NOT IMPLEMENTED — symlink handling not considered.

### 2.6 Rapid Writes Cause Read Amplification

**Root cause:** A dev server outputting thousands of lines per second triggers `fs.watch` for every write. Each callback reads from the last position to the current end, but by the time the read completes, more data has been written.

**How it manifests:** High CPU usage from constant read cycles. Potential for the tailer to fall behind.

**Defensive pattern:** Batch reads with a small debounce (10-50ms). Read all available data in one pass.

**Status:** ⚠️ NOT YET IMPLEMENTED — no debouncing on the watch callback.

---

## 3. MCP stdio Transport Pitfalls

### 3.1 stdout Pollution Breaks JSON-RPC

**Root cause:** The MCP stdio transport uses stdout exclusively for JSON-RPC messages. ANY non-JSON-RPC output on stdout corrupts the protocol stream and disconnects the client.

**Sources:**
- [MCP Spec](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports): "The server MUST NOT write anything to its stdout that is not a valid MCP message."
- [rapidevelopers.com](https://www.rapidevelopers.com/mcp-tutorial/how-to-fix-mcp-json-rpc-parse-errors): "The MCP stdio transport uses stdout exclusively for JSON-RPC messages, so any console.log(), print(), or debug output on stdout corrupts the protocol stream."
- [whatismcp.com](https://www.whatismcp.com/articles/notes-on-implementing-mcp-server): "Using stdio as a communication channel is problematic. There's the risk of dependent libraries inadvertently writing to stdio."

**How it manifests:** Agent connects, then immediately gets parse errors. All tool calls fail.

**Defensive patterns:**
1. Never use `console.log()` — only `console.error()` or `process.stderr.write()`.
2. Audit all dependencies for stdout writes. Some libraries (e.g., debug, pino with default config) write to stdout.
3. Consider redirecting `process.stdout` to a no-op or stderr as a safety net.

**Status:** ✅ All TracePulse diagnostic output goes to stderr. ⚠️ Third-party dependencies could still write to stdout — need to audit or add a stdout guard.

### 3.2 Unhandled Exceptions Crash the MCP Server

**Root cause:** An uncaught exception or unhandled promise rejection in a tool handler kills the Node.js process, breaking the stdio pipe.

**Source:** [mcpserverspot.com](https://www.mcpserverspot.com/learn/building/mcp-production-troubleshooting): "If any exception escapes your tool handler without being caught, the MCP server process may crash, terminating the stdio pipe."

**How it manifests:** Agent calls a tool, the server crashes, the agent reports "server disconnected."

**Defensive patterns:**
1. Wrap every tool handler in try/catch, return `isError: true` on failure.
2. Add `process.on('uncaughtException')` and `process.on('unhandledRejection')` as last-resort handlers that log to stderr and attempt graceful shutdown.
3. Never call `process.exit()` from a signal handler without first closing the MCP server.

**Status:** ✅ Tool handlers have try/catch. ⚠️ No global uncaughtException/unhandledRejection handlers yet.

### 3.3 Broken Pipe Detection

**Root cause:** When the MCP client (IDE/agent) crashes or disconnects, the stdio pipe breaks. Writing to a broken pipe emits an `EPIPE` error.

**How it manifests:** TracePulse keeps running but can't communicate with the agent. The child dev server also keeps running, consuming resources.

**Defensive pattern:** Listen for `EPIPE` errors on `process.stdout`. On detection, initiate graceful shutdown (stop collector, kill child process, exit).

**Status:** ⚠️ NOT YET IMPLEMENTED — need to add EPIPE detection on stdout.

### 3.4 Large MCP Responses Overwhelm Agent Context

**Root cause:** Returning too many events or too much data in a single MCP tool response can exceed the agent's context window, causing it to lose track of the conversation.

**How it manifests:** Agent calls `get_errors` with no limit, gets back 500 events with full stack traces. The response is 50K+ tokens. Agent becomes confused.

**Defensive pattern:** Enforce default limits (20 for errors, 50 for logs). Cap maximum at 100. Truncate stack traces and raw lines.

**Status:** ✅ Implemented — default limits and truncation in place.

---

## 4. Error Parsing Pitfalls

### 4.1 Regex Catastrophic Backtracking (ReDoS)

**Root cause:** Certain regex patterns with nested quantifiers can cause exponential backtracking on pathological input. A single malicious or unusual log line can freeze the event loop for seconds or minutes.

**Source:** [loke.dev](https://loke.dev/blog/v8-regex-backtracking-redos-performance): "Catastrophic Backtracking happens when a regex engine encounters an ambiguous pattern paired with an input that almost matches, but fails at the very end."

**How it manifests:** TracePulse becomes unresponsive. MCP tool calls time out. The agent thinks the server is down.

**Defensive patterns:**
1. Audit all regex patterns for nested quantifiers (`(a+)+`, `(a|b)*c`).
2. Use atomic groups or possessive quantifiers where available.
3. Impose a per-line timeout: if parsing takes >10ms, skip the line.
4. Limit input length before regex matching.

**Status:** ⚠️ PARTIALLY HANDLED — patterns are reviewed but no per-line timeout guard. Need to add input length limit before parsing.

### 4.2 Multi-Line Stack Trace Grouping

**Root cause:** Stack traces span multiple lines. When processing line-by-line from a stream, the parser sees the error message on one line and the stack frames on subsequent lines. Without a grouping mechanism, each line is parsed independently.

**Source:** This is the #1 challenge in log aggregation — Logstash, Fluent Bit, Promtail, and Splunk all have dedicated multi-line handling configurations.

**How it manifests:** A Python traceback produces 10+ separate info-level events instead of one error-level event with a complete stack trace.

**Defensive pattern:** Buffer lines and use heuristics to detect multi-line blocks:
- Python: lines between `Traceback (most recent call last):` and the final exception line.
- Java: lines starting with `\tat ` or `Caused by:` following an exception line.
- Node.js: lines starting with `    at ` following an error line.

**Status:** ⚠️ PARTIALLY HANDLED — parsers handle multi-line input when the full block is passed as a single string. But the pipeline currently processes line-by-line. Need a line accumulator/grouper between the collector and the parser.

### 4.3 Mixed Output (Structured + Unstructured)

**Root cause:** Many dev servers output a mix of JSON structured logs and plain text. For example, Express with pino outputs JSON for request logs but plain text for startup messages and uncaught exceptions.

**How it manifests:** The JSON parser matches some lines, the Node parser matches others, and some lines match neither. Inconsistent parsing quality.

**Defensive pattern:** Try JSON parser first (it's unambiguous — either valid JSON or not). Fall back to framework-specific parsers. This is already the parser registry order.

**Status:** ✅ Implemented — JSON parser is first in the registry.

### 4.4 ANSI Escape Codes in Output

**Root cause:** Many dev servers output colored text using ANSI escape codes (`\x1b[31m`, `\x1b[0m`, etc.). These codes appear in error messages and stack traces.

**How it manifests:** Regex patterns fail to match because the expected text is interspersed with escape sequences. `TypeError: Cannot read` becomes `\x1b[31mTypeError\x1b[0m: Cannot read`.

**Defensive pattern:** Strip ANSI escape codes from each line before parsing. Regex: `/\x1b\[[0-9;]*m/g`.

**Status:** ❌ NOT IMPLEMENTED — ANSI stripping not in the pipeline. This is a significant gap.

---

## 5. Signal Handling & Shutdown Pitfalls

### 5.1 SIGTERM Not Supported on Windows

**Root cause:** Windows doesn't have POSIX signals. `process.on('SIGTERM')` works on Windows but `process.kill(pid, 'SIGTERM')` sends a different signal. `process.kill(-pid)` (process group kill) doesn't work on Windows at all.

**Source:** [StackOverflow](https://stackoverflow.com/questions/61655836/sigterm-in-node-js-on-windows): "SIGTERM in node.js on Windows" — Windows uses `TerminateProcess` which is equivalent to SIGKILL (no graceful shutdown).

**How it manifests:** On Windows, `stop()` kills the shell but the dev server grandchild survives.

**Defensive pattern:** On Windows, use `taskkill /pid ${pid} /T /F` to kill the process tree. Detect platform with `process.platform`.

**Status:** ❌ NOT IMPLEMENTED — Windows process tree kill not handled. Documented as out of scope for Phase 1.

### 5.2 Double Signal Handling

**Root cause:** If the user presses Ctrl+C twice quickly, the SIGINT handler fires twice. If the handler initiates shutdown on the first call and the shutdown is async, the second call may start a second shutdown while the first is still in progress.

**Source:** [StackOverflow](https://stackoverflow.com/questions/46908853/process-onsigint-multiple-termination-signals): "process.on('SIGINT') multiple termination signals."

**How it manifests:** Race condition in shutdown — double SIGTERM to child, double close on MCP server, potential crash.

**Defensive pattern:** Use a `shuttingDown` flag. Ignore subsequent signals while shutdown is in progress.

**Status:** ⚠️ NOT YET IMPLEMENTED — need to add a shutdown guard flag.

### 5.3 process.exit() Prevents Cleanup

**Root cause:** Calling `process.exit()` immediately terminates the process without waiting for async operations (stream flushes, file closes, child process cleanup).

**How it manifests:** Child process not killed, stderr logs not flushed, MCP server not properly closed.

**Defensive pattern:** Never call `process.exit()` directly. Set a flag, clean up, then exit. Use `process.exitCode = N` to set the exit code without forcing immediate exit.

**Status:** ⚠️ Need to audit CLI for `process.exit()` calls.

---

## 6. Cross-Cutting Concerns

### 6.1 Memory Growth from Ring Buffer Dedup Map

**Root cause:** The fingerprint → index map grows with unique fingerprints. If the dev server produces many unique error messages (e.g., with timestamps or request IDs embedded), the map grows unboundedly even though the ring buffer itself is bounded.

**How it manifests:** Slow memory leak over long sessions.

**Defensive pattern:** When evicting an event from the ring buffer (FIFO), also remove its fingerprint from the map. This is already implemented but needs verification for edge cases (stale pointers).

**Status:** ✅ Implemented — eviction removes old fingerprint from map.

### 6.2 Event Loop Blocking from Synchronous Regex

**Root cause:** All regex matching in Node.js is synchronous and runs on the main thread. A complex regex on a long string blocks the event loop, preventing MCP tool calls from being processed.

**How it manifests:** MCP tool calls time out while the parser is stuck on a pathological line.

**Defensive pattern:** Limit line length before parsing (e.g., 10KB max). Consider using `worker_threads` for parsing if performance becomes an issue.

**Status:** ⚠️ NOT YET IMPLEMENTED — no line length limit before parsing.

### 6.3 High-Frequency Output Floods the Ring Buffer

**Root cause:** A dev server in a crash loop or with verbose debug logging can produce thousands of events per second. The ring buffer handles this (FIFO eviction), but the pipeline (redact → parse → normalize → score → push) runs synchronously for each line.

**How it manifests:** Event loop saturation. MCP tool calls queue up behind parsing work. Agent experiences timeouts.

**Defensive pattern:** Rate-limit the pipeline. If more than N lines/second arrive, start sampling (process every Nth line) or batch processing. Log a warning when rate limiting kicks in.

**Status:** ❌ NOT IMPLEMENTED — no rate limiting.

---

## 7. Hardening Checklist

Priority-ordered list of defensive improvements to implement:

### P0 — Must Fix (Data Correctness / Crash Prevention)

| # | Issue | Section | Effort |
|---|-------|---------|--------|
| 1 | Strip ANSI escape codes before parsing | 4.4 | Small — one regex replace in pipeline |
| 2 | Add global uncaughtException/unhandledRejection handlers | 3.2 | Small — 10 lines in cli.ts |
| 3 | Add shutdown guard flag (prevent double shutdown) | 5.2 | Small — boolean flag in cli.ts |
| 4 | Add EPIPE detection on stdout for broken pipe | 3.3 | Small — error listener on process.stdout |
| 5 | Set PYTHONUNBUFFERED=1 in spawner environment | 1.1 | Small — one line in process-spawner.ts |
| 6 | Add line length limit before parsing (10KB) | 1.8, 6.2 | Small — truncate in pipeline |

### P1 — Should Fix (Reliability)

| # | Issue | Section | Effort |
|---|-------|---------|--------|
| 7 | Multi-line stack trace accumulator | 4.2 | Medium — line buffer with timeout flush |
| 8 | fs.watch polling fallback for Docker/NFS | 2.2 | Medium — detect and fall back |
| 9 | Log rotation inode change detection | 2.3 | Small — stat() check on watch event |
| 10 | Debounce fs.watch callbacks | 2.1, 2.6 | Small — 50ms debounce |
| 11 | stdout guard (intercept accidental stdout writes) | 3.1 | Small — override process.stdout.write |

### P2 — Nice to Have (Performance / Edge Cases)

| # | Issue | Section | Effort |
|---|-------|---------|--------|
| 12 | Rate limiting for high-frequency output | 6.3 | Medium — sampling/batching |
| 13 | Symlink target change detection | 2.5 | Small — periodic readlink |
| 14 | Windows process tree kill | 5.1 | Medium — platform-specific code |
| 15 | ReDoS timeout guard per regex | 4.1 | Medium — worker thread or timeout |

---

## Sources

- [Node.js child_process data loss with piped stdout](https://github.com/nodejs/node/issues/7184)
- [Node.js stdout/stderr ordering not maintained](https://github.com/nodejs/node/issues/26516)
- [MCP Spec: stdio transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [MCP Production Troubleshooting](https://www.mcpserverspot.com/learn/building/mcp-production-troubleshooting)
- [Notes on Implementing an MCP Server](https://www.whatismcp.com/articles/notes-on-implementing-mcp-server)
- [Fix MCP JSON-RPC Parse Errors](https://www.rapidevelopers.com/mcp-tutorial/how-to-fix-mcp-json-rpc-parse-errors)
- [Debugging MCP Connections](https://grizzlypeaksoftware.com/library/debugging-mcp-connections-and-transport-issues-msnc7pdr)
- [Error Handling Patterns for MCP](https://grizzlypeaksoftware.com/library/error-handling-patterns-for-mcp-hschbaxy)
- [5 Tips for Cleaning Orphaned Node.js Processes](https://arunangshudas.medium.com/5-tips-for-cleaning-orphaned-node-js-processes-196ceaa6d85e)
- [tree-kill: Kill all processes in the process tree](https://github.com/jub3i/tree-kill)
- [fs.watch fired twice](https://stackoverflow.com/questions/12978924/fs-watch-fired-twice-when-i-change-the-watched-file)
- [Node.js child process spawn buffering issues](https://stackoverflow.com/questions/20978413/node-js-child-process-spawn-issues-with-buffering)
- [Python: Disable output buffering](https://stackoverflow.com/q/23034580)
- [V8 Regex Backtracking / ReDoS](https://loke.dev/blog/v8-regex-backtracking-redos-performance)
- [Node.js Backpressuring in Streams](https://nodejs.org/learn/modules/backpressuring-in-streams.html)
- [Vite: Use fs.watch instead of chokidar](https://github.com/vitejs/vite/issues/12495)
- [Docker: File mount does not update with changes from host](https://github.com/moby/moby/issues/15793)
- [Fluent Bit K8s Multiline Parsing](https://openillumi.com/en/en-fluent-bit-k8s-multiline-log-fix/)
- [Handling Multiline Events in Splunk](https://thinkcloudly.com/blog/handling-multiline-events-splunk/)
- [SIGTERM in Node.js on Windows](https://stackoverflow.com/questions/61655836/sigterm-in-node-js-on-windows)
- [process.on('SIGINT') multiple termination signals](https://stackoverflow.com/questions/46908853/process-onsigint-multiple-termination-signals)
- [Unhandled Promise Rejections crash Node.js](https://dzone.com/articles/unhandled-promise-rejections-nodejs-crash)
