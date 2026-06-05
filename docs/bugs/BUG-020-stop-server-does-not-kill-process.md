# BUG-020: stop_server does not kill the managed process

| Field | Value |
|-------|-------|
| **ID** | BUG-020 |
| **Severity** | High |
| **Status** | Fixed |
| **Reported** | 2026-06-05 |
| **Fixed** | 2026-05-18 — commit `0fa41ba` |
| **Branch** | `main` |
| **Source** | Agent feedback log 2026-05-18 |

## Description

Calling `stop_server(name)` returns a success response but does not actually terminate the managed process. The server keeps running and accepting requests. A subsequent `start_server` call on the same port fails with EADDRINUSE.

Expected: `stop_server` sends SIGTERM to the spawned process, waits for exit, then SIGKILL if it doesn't exit within a grace period.

## Reproduction Steps

1. `start_server(name: "api", command: "npm run dev", port: 8787)`
2. Verify running: `check_port(8787)` → in use
3. `stop_server(name: "api")` → returns success
4. `check_port(8787)` → still in use (process didn't die)

## Root Cause

`handleStopServer` in `src/tools/stop-server.ts` calls `manager.setStopped(name)` which only updates the in-memory process registry map. It does not invoke the `spawner.stop()` method.

`ProcessSpawner.stop()` already has correct SIGTERM → wait → SIGKILL logic, but it is never wired to the `stop_server` tool handler. The `ServerManager` interface has no `onStopRequest` callback analogous to `onSpawnRequest`.

## Fix Description

1. Add `onStopRequest?: (name: string) => Promise<void>` callback to `ServerManager`
2. CLI layer wires it to `spawner.stop(name)` (same pattern as `onSpawnRequest`)
3. `handleStopServer` awaits the callback before marking the server stopped in the registry
4. Graceful fallback: if `onStopRequest` is not set (standalone mode), log a warning

## Files to Change

- `src/server/server-manager.ts` — add `onStopRequest` to interface
- `src/tools/stop-server.ts` — call `onStopRequest` before `setStopped`
- `src/cli/start.ts` — wire `spawner.stop` to `onStopRequest`

## Regression Tests

- `test_bug020_stop_server_kills_process` — start server, stop it, check port is free
- `test_bug020_stop_server_sigkill_fallback` — stop a process that ignores SIGTERM
