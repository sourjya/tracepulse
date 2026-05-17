# TracePulse Feature Request: Force-Restart Server

**Date:** 2026-05-16
**Priority:** High (blocks UI verification workflow)

## Problem

`restart_server` only works when TracePulse started the server ("start mode"). If the server was started externally (e.g., `bash scripts/start.sh` in another terminal), TP says:

> "restart_server only works in start mode. In attach mode, TracePulse doesn't own the server process."

This means the agent cannot restart the server to pick up code changes, which blocks the mandatory UI verification step.

## Desired Behavior

A `force_restart_server` (or a `--force` flag on `restart_server`) that:

1. Kills whatever is listening on the configured port (SIGTERM → wait 2s → SIGKILL)
2. Starts a fresh server using the configured command
3. Waits for the port to become available
4. Returns success/failure

Equivalent to:
```bash
fuser -k {port}/tcp
sleep 2
{start_command}
```

## Why This Matters

The Kiro steering rules require:
> **UI Change Verification — MANDATORY**: ALWAYS verify UI changes via Chrome DevTools before reporting to the user.

Without the ability to restart the server, the agent cannot verify frontend changes that require a server restart (new builds with hashed filenames, new routes, etc.).

## Workaround (Current)

Tell the user to restart manually. This breaks the autonomous workflow.
