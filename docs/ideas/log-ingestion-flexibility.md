# Log Ingestion Flexibility - Design Ideas

Technical designs for expanding how TracePulse collects log data. Ordered by implementation priority.

---

## 1. Multi-File Attach Mode

**Priority: HIGH - solves the #1 agent pain point (PlanIQ)**
**Effort: Low (30 min)**
**Depends on: existing LogFileTailer + ServiceRegistry**

### Problem

Agent tails one backend log but can't see frontend (Vite), worker (Celery), or other service logs. Hot-reload detection fails because uvicorn messages are in a different log file than the one being tailed.

### Agent benefit

- `watch_for_errors` detects reloads from ANY tailed log file
- `get_errors(service: "worker")` filters to one service
- `list_services` shows all tailed files and their status
- One TracePulse instance replaces N manual log reads

### CLI

```bash
# Named files
tracepulse attach --log-file backend=./logs/backend.log --log-file frontend=./logs/frontend.log

# Unnamed (service name derived from filename)
tracepulse attach --log-file ./logs/backend.log --log-file ./logs/frontend.log
```

### Data flow

```
./logs/backend.log  --> LogFileTailer("backend")  --\
                                                     +--> ServiceRegistry --> Pipeline --> Buffer --> MCP Tools
./logs/frontend.log --> LogFileTailer("frontend") --/
```

### Process flow

1. CLI parses multiple `--log-file` flags
2. For each file: create a LogFileTailer, register service in ServiceRegistry
3. Each tailer's `onLine` callback tags lines with the service name
4. All lines flow through the shared pipeline into the shared ring buffer
5. Events have `service: "backend"` or `service: "frontend"`
6. Agent queries with `get_errors(service: "backend")` or without filter for all

### Implementation

- Extend `parseArgs` to accept multiple `--log-file` flags (format: `name=path` or just `path`)
- In `main()`, when multiple files: create one LogFileTailer per file, register each in ServiceRegistry
- Reuse existing `createPipeline` - just pass service name through

### Files to change

- `src/cli.ts` - parse multiple `--log-file`, create multiple tailers
- No new modules needed

---

## 2. Stdin Pipe Mode

**Priority: Medium**
**Effort: Low (20 min)**
**Depends on: nothing new**

### Problem

Users with custom log aggregation (journald, Docker, tmux capture) can't pipe output into TracePulse. They have to write to a file first, then attach.

### Agent benefit

- Works with any log source that can pipe to stdout
- Zero config - just pipe and go
- Composable with Unix tools: `grep`, `tail`, `tee`

### CLI

```bash
# Pipe from any source
tail -f /var/log/app.log | tracepulse pipe
docker logs -f mycontainer | tracepulse pipe
journalctl -f -u myapp | tracepulse pipe

# With service name
tail -f backend.log | tracepulse pipe --service backend
```

### Data flow

```
external process --> stdout --> pipe --> tracepulse stdin --> readline --> Pipeline --> Buffer --> MCP Tools
```

### Process flow

1. CLI detects `pipe` subcommand
2. Create readline interface on `process.stdin`
3. Each line goes through the standard pipeline
4. MCP server runs on stdio - BUT stdin is used for log input, not MCP
5. Solution: MCP runs on HTTP transport only in pipe mode (`--http` auto-enabled)

### Conflict: stdin used for both MCP and log input

This is the key design challenge. MCP stdio transport uses stdin/stdout for JSON-RPC. If stdin is a log pipe, MCP can't use it.

**Resolution:** In pipe mode, auto-enable HTTP transport. MCP client connects via HTTP instead of stdio. The MCP config would be:

```json
{
  "mcpServers": {
    "tracepulse": {
      "url": "http://127.0.0.1:9800"
    }
  }
}
```

And the pipe command is run separately in a terminal:
```bash
tail -f app.log | tracepulse pipe --http-port 9800
```

### Files to change

- `src/cli.ts` - add `pipe` subcommand, readline on stdin, auto-enable HTTP
- `src/transport/http-transport.ts` - already exists, just needs wiring

---

## 3. Log Directory Watching

**Priority: Medium**
**Effort: Medium (1-2 hours)**
**Depends on: Multi-File Attach Mode (#1)**

### Problem

Microservice setups write logs to a directory (`./logs/api.log`, `./logs/worker.log`, `./logs/scheduler.log`). New services appear as new log files. User doesn't want to enumerate every file.

### Agent benefit

- Zero config for multi-service setups
- New services auto-discovered when their log file appears
- `list_services` dynamically reflects running services

### CLI

```bash
tracepulse attach --log-dir ./logs/
tracepulse attach --log-dir ./logs/ --pattern "*.log"
```

### Data flow

```
./logs/
  api.log       --> LogFileTailer("api")       --\
  worker.log    --> LogFileTailer("worker")     +--> Pipeline --> Buffer
  scheduler.log --> LogFileTailer("scheduler") --/
  (new file)    --> auto-detect, create tailer --/
```

### Process flow

1. CLI parses `--log-dir` flag
2. On startup: scan directory for matching files, create tailer per file
3. Watch directory with `fs.watch` for new files
4. When new file appears: create tailer, register service
5. Service name derived from filename (strip extension)
6. When file is deleted/rotated: mark service as stopped

### Files to change

- `src/collectors/log-dir-watcher.ts` - new module, wraps multiple LogFileTailers
- `src/cli.ts` - add `--log-dir` and `--pattern` flags

---

## 4. Combined Start + Attach

**Priority: Low**
**Effort: Low (30 min)**
**Depends on: Multi-File Attach Mode (#1)**

### Problem

Common setup: TracePulse spawns the API server but also needs to tail a Celery worker log that's managed separately.

### Agent benefit

- Single TracePulse instance for the whole stack
- `list_services` shows both spawned and tailed services
- Correlation works across spawned and tailed services

### CLI

```bash
tracepulse start "npm run api" --also-tail worker=./logs/celery.log
tracepulse start --service api="npm run api" --also-tail worker=./logs/celery.log
```

### Data flow

```
spawn("npm run api") --> ProcessSpawner("api")    --\
                                                     +--> Pipeline --> Buffer
./logs/celery.log    --> LogFileTailer("worker")  --/
```

### Process flow

1. CLI parses `--also-tail` flags alongside `start` command
2. Create ProcessSpawner for the start command
3. Create LogFileTailer for each `--also-tail` file
4. Both register in ServiceRegistry
5. Shutdown: stop spawned process AND stop tailers

### Files to change

- `src/cli.ts` - add `--also-tail` flag, create mixed collectors

---

## 5. HTTP Log Ingestion (expand existing)

**Priority: Low**
**Effort: Low (already built)**
**Depends on: nothing - already exists at port 9801**

### Problem

Some apps can't write to files or stdout easily (serverless functions, browser apps, mobile backends). They need to POST logs to an endpoint.

### Agent benefit

- Any app that can make HTTP calls can send errors to TracePulse
- Works across network boundaries (still localhost only)
- Structured input - app sends JSON, TracePulse stores it

### Current state

`src/correlation/sources/log-collector.ts` already runs an HTTP server on port 9801 that accepts `POST /api/v1/errors`. Currently only used for frontend errors feeding the correlation buffer.

### Expansion

Add a `POST /api/v1/logs` endpoint that accepts general log lines and feeds them through the standard pipeline (not just the frontend buffer):

```bash
curl -X POST http://127.0.0.1:9801/api/v1/logs \
  -H "Content-Type: application/json" \
  -d '{"message": "Error in handler", "level": "error", "service": "lambda"}'
```

### Files to change

- `src/correlation/sources/log-collector.ts` - add `/api/v1/logs` route
- Route to standard pipeline instead of frontend buffer
