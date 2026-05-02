# Hot-Reload Detection

When you save a file, your dev server reloads. TracePulse detects this and tells the agent "your change just took effect." Without this, the agent has no way to know if the server actually picked up the new code.

## Why It Matters

The agent edits a file. Vite hot-reloads. The agent calls `watch_for_errors(5)`. If `hot_reload_detected: true`, the agent knows the server reloaded with the new code and any errors are from the new version. If `false`, the errors might be stale from before the edit.

## Supported Dev Tools (12 patterns across 9 tools)

| Tool | What TracePulse detects |
|------|----------------------|
| **Vite** | Compilation success, HMR module updates |
| **webpack** | Compilation completed |
| **nodemon** | File change restart, starting events |
| **Next.js** | Compilation, route compiling |
| **ts-node-dev** | Restart, compilation complete |
| **uvicorn** | WatchFiles detected changes, reloader process |
| **Django** | File change watching, system checks |
| **Flask** | Restart with stat/watchdog, change detection |
| **air** (Go) | Building, running, file change detected |

## How It Works

When a hot-reload pattern matches a log line, TracePulse injects a synthetic marker event with `fingerprint: "hotreload:{pattern-id}"`. The `watch_for_errors` and `verify_fix` tools check for these markers and set `hot_reload_detected: true` in the response.

## Attach Mode

In attach mode, TracePulse only sees reload messages from the log file it's tailing. If your frontend (Vite) and backend (uvicorn) are separate processes, tailing the backend log won't detect Vite HMR. Use multi-file attach mode to see both, or use `get_build_errors()` as the reliable check.
