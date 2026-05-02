# Multi-Service Monitoring

Most real projects have more than one process: an API server, a background worker, a frontend dev server. TracePulse monitors all of them simultaneously and tags each error with its source service.

## Option 1: Multi-process start

Spawn multiple services and monitor them all:

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse",
      "args": ["start",
        "--service", "api=npm run dev:api",
        "--service", "worker=npm run worker"
      ]
    }
  }
}
```

TracePulse spawns both processes, captures their stdout/stderr separately, and tags every event with the service name.

## Option 2: Multi-file attach

If your services are already running (managed by Docker, tmux, pm2, or scripts), tail their log files:

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse",
      "args": ["attach",
        "--log-file", "backend=./logs/backend.log",
        "--log-file", "frontend=./logs/frontend.log",
        "--log-file", "worker=./logs/worker.log"
      ]
    }
  }
}
```

Each log file is tagged with the name you give it (before the `=`).

## Option 3: Docker Compose

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse",
      "args": ["compose", "--file", "docker-compose.yml"]
    }
  }
}
```

TracePulse discovers services from the Compose file and tails their container logs automatically.

## Querying by service

Once running, filter errors by service:

```
get_errors(service: "api")          # Only API errors
get_errors(service: "worker")       # Only worker errors
get_errors()                        # All services combined
list_services()                     # Overview of all services
```

## Service status

`list_services()` shows which services are running, crashed, or stopped:

```json
{
  "services": [
    { "name": "api", "status": "running", "errorCount": 2, "lastActivity": 1714300005000 },
    { "name": "worker", "status": "crashed", "errorCount": 1, "lastActivity": 1714300003000 }
  ]
}
```

If a service crashes, TracePulse detects it immediately. If it crashes 3+ times in 60 seconds, TracePulse injects a crash loop alert at signal_score 95.
