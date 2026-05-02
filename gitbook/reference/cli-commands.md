# CLI Commands

TracePulse has four modes: **start** (spawn and monitor), **attach** (tail existing logs), **compose** (Docker Compose), and **standalone** (tools only, no server).

## `tracepulse start`

Spawn a dev server as a child process and monitor its stdout/stderr for errors.

```bash
tracepulse start <command>
```

TracePulse manages the process lifecycle - it forwards SIGTERM/SIGKILL on shutdown so your server stops cleanly.

**Examples:**

```bash
tracepulse start "npm run dev"
tracepulse start "python manage.py runserver"
tracepulse start "uvicorn main:app --reload"
tracepulse start "go run main.go"
tracepulse start "cargo run"
```

### Options

| Flag | Description |
|------|-------------|
| `--service name="command"` | Run multiple services. Repeat for each service. |
| `--config <path>` | Load service definitions from a JSON config file. |
| `--persist` | Save error fingerprints to `.tracepulse/` on shutdown. Enables `get_new_errors` and `get_error_trends` across sessions. |
| `--http` | Start a Streamable HTTP server on port 9800 alongside stdio. Allows multiple MCP clients to connect simultaneously. |
| `--http-port <port>` | Override the HTTP port (default: 9800). |
| `--health-url <url>` | Register a health probe that TracePulse checks periodically. |

### Multi-process mode

Monitor multiple services at once. Each service's output is tagged with its name - filter with `get_errors(service: "api")`.

```bash
tracepulse start --service api="npm run dev:api" --service worker="npm run worker"
```

### Config file mode

Read service definitions from a JSON file instead of CLI flags.

```bash
tracepulse start --config tracepulse.config.json
```

---

## `tracepulse attach`

Tail one or more existing log files without spawning any process. Use when your servers are already running - managed by Docker, tmux, pm2, systemd, or custom scripts.

```bash
tracepulse attach --log-file <path>
```

**Examples:**

```bash
# Single log file
tracepulse attach --log-file ./logs/server.log

# Multiple log files with names
tracepulse attach --log-file api=./logs/api.log --log-file worker=./logs/worker.log
```

### Options

| Flag | Description |
|------|-------------|
| `--log-file <path>` | Path to a log file to tail. Repeat for multiple files. |
| `--log-file name=<path>` | Named log file - the name tags events for filtering with `get_errors(service: "name")`. |

---

## `tracepulse compose`

Discover services from a Docker Compose file and tail their container logs via the Docker Engine API.

```bash
tracepulse compose --file docker-compose.yml
```

Each container's output is tagged with its compose service name.

### Options

| Flag | Description |
|------|-------------|
| `--file <path>` | Path to docker-compose.yml (default: `docker-compose.yml` in current directory). |
| `--persist` | Save fingerprints across sessions. |
| `--http` | Enable Streamable HTTP transport. |
| `--http-port <port>` | Override the HTTP port. |

---

## `tracepulse standalone`

Start TracePulse with no dev server and no log file. The MCP tools are available but no collector is running. Useful for fresh projects, libraries, or when you only need `run_and_watch` and `check_drift`.

```bash
tracepulse standalone
```

### Options

| Flag | Description |
|------|-------------|
| `--persist` | Save fingerprints across sessions. |

{% hint style="info" %}
**Auto-fallback:** If `tracepulse start` fails to spawn the dev server (e.g., missing dependency, wrong command), it automatically falls back to standalone mode instead of crashing. The agent can still use tools like `run_and_watch` and `get_project_health`.
{% endhint %}

---

## Global flags

| Flag | Description |
|------|-------------|
| `--version`, `-v` | Print version to stderr and exit. |
| `--help`, `-h` | Print usage help to stderr and exit. |

---

## Which mode should I use?

| Situation | Mode |
|-----------|------|
| Simple `npm run dev` or `python manage.py runserver` | **start** |
| Servers managed by Docker, tmux, pm2, systemd | **attach** |
| Docker Compose setup | **compose** |
| Fresh project, library, or no server yet | **standalone** |
| Multiple services (API + worker + frontend) | **start --service** or **--config** |
