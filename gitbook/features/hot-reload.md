# Hot-Reload Detection

TracePulse detects when your dev server reloads after a file change.

## Supported Dev Tools (11 patterns)

| Tool | Patterns |
|------|----------|
| **Vite** | Compilation success, HMR updates |
| **webpack** | Compilation completed |
| **nodemon** | Restart, starting events |
| **Next.js** | Compilation, route compiling |
| **ts-node-dev** | Restart, compilation complete |
| **uvicorn** | WatchFiles detected changes, reloader process |
| **Django** | File change watching, system checks |
| **Flask** | Restart with stat/watchdog, change detection |

## How It Works

When a hot-reload pattern matches a log line, TracePulse injects a synthetic event:
- `level: "info"`, `signal_score: 5`
- `fingerprint: "hotreload:{pattern-id}"`
- `hot_reload_detected: true` in `watch_for_errors` response

## Attach Mode Caveat

In attach mode, TracePulse only sees reload messages from the log file it's tailing. If your frontend (Vite) and backend (uvicorn) are separate processes, tailing the backend log won't detect Vite HMR. Use multi-file attach to see both.
