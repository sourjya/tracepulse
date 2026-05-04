# BUG-017: Standalone mode isConnected returns true

- **ID:** BUG-017
- **Severity:** HIGH
- **Status:** FIXED
- **Found:** 2026-05-04
- **Fixed:** 2026-05-04

## Description

Standalone mode's no-op collector returned `isConnected: true`. This caused `get_project_health` to report `server.connected: true` and skip start command suggestions. Users in zero-config mode saw "All clear: server running" when no server was running.

## Impact

- `get_project_health` showed no suggestions for starting a server
- Agent had no way to know it should call `start_server()`
- Completely broke the M21 zero-config UX flow

## Root Cause

In `src/cli.ts` line 552, the standalone collector was created with `isConnected() { return true; }`. This was likely a copy-paste from the start mode fallback where `true` made sense (server was running but crashed).

## Fix

Changed to `isConnected() { return false; }` in the standalone collector.

## Regression Tests

- `tests/unit/startup-regressions.test.ts`: BUG-017 standalone isConnected
- `scripts/test-install.sh`: S4 (Python with start script suggestions)

## Files Changed

- `src/cli.ts`
