---
description: "Start the dev server with TracePulse monitoring"
---

# @tp-start

Start the project's dev server with live error monitoring.

1. Detect the dev server command from package.json (`dev`, `start`), manage.py, Makefile, or Cargo.toml
2. Call `start_server(command, wait: true)` with the detected command
3. If it crashes immediately: call `get_errors()` and diagnose the startup failure
4. If it starts successfully: call `get_health_summary()` and report status
5. If port is in use: call `free_port(port)` first, then retry
