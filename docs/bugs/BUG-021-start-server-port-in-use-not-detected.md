# BUG-021: start_server spawns without checking if port is already in use

| Field | Value |
|-------|-------|
| **ID** | BUG-021 |
| **Severity** | Medium |
| **Status** | Fixed |
| **Reported** | 2026-06-05 |
| **Fixed** | 2026-06-05 — v0.9.25 |
| **Branch** | `main` |
| **Source** | Agent feedback log 2026-05-15 |

## Description

`start_server` attempts to spawn the process even when the specified port is already occupied. The spawn fails with EADDRINUSE, but the error message gives no actionable guidance. Agents retry `start_server` multiple times before giving up and falling back to shell commands.

Expected: `start_server` checks port availability before spawning and returns a structured error with a specific remediation hint if the port is in use.

## Reproduction Steps

1. Start any process on port 8787 (e.g., a previous session's orphaned server)
2. `start_server(name: "api", command: "npm run dev", port: 8787)`
3. Observe: spawn crashes with EADDRINUSE, no hint on how to recover
4. Agent calls `start_server` 4 more times with the same result

Observed in production: agent called `start_server` 5 times before falling back to `Bash("lsof -ti:8787 | xargs kill -9")`.

## Root Cause

`handleStartServer` in `src/tools/start-server.ts` passes the command directly to the spawner with no pre-flight port check. The EADDRINUSE error from the OS surfaces as a generic spawn error with no structured recovery hints.

`check_port` already exists and can detect the condition. The fix is to call it before spawning.

## Fix Description

1. In `handleStartServer`, if `port` is provided: call `checkPortAvailable(port)` before spawning
2. If port is occupied, return early with:
   ```json
   {
     "error": "Port 8787 is already in use.",
     "hint": "Call stop_server() if this is a TracePulse-managed server, or free_port(8787) to kill whatever holds it."
   }
   ```
3. If `port` is not provided, skip the check (the spawner will bind to an ephemeral port)

## Fix Applied

**`src/tools/start-server.ts`:**
- Added `isPortOccupied(port)` TCP probe (connects to `127.0.0.1:<port>`, 800ms timeout)
- Added `port` extraction from args in `handleStartServer`
- Pre-spawn guard: if port is occupied, returns `{ status: "port_in_use", port, hint, next_steps }` immediately

**`src/mcp/server.ts`:**
- Added `port: z.number().optional()` to `start_server` schema registration

## Regression Tests

Added to `tests/unit/start-server.test.ts`:
- `returns port_in_use when specified port is already occupied` — binds a real OS port, confirms structured error returned
- `proceeds normally when specified port is free` — releases a port, confirms `port_in_use` is not returned
