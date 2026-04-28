# Multi-Service Monitoring

Monitor multiple services simultaneously.

## Multi-file attach

Tail multiple log files, each tagged with a service name:

```json
{
  "args": ["tracepulse", "attach",
    "--log-file", "backend=./logs/backend.log",
    "--log-file", "frontend=./logs/frontend.log",
    "--log-file", "worker=./logs/worker.log"
  ]
}
```

## Multi-process start

Spawn multiple services:

```json
{
  "args": ["tracepulse", "start",
    "--service", "api=npm run dev:api",
    "--service", "worker=npm run worker"
  ]
}
```

## Querying by service

```
get_errors(service: "api")          # only API errors
get_errors(service: "worker")       # only worker errors
get_errors()                        # all services
list_services()                     # service status overview
```

## Service status

`list_services()` returns:
```json
{
  "services": [
    { "name": "api", "status": "running", "errorCount": 2, "lastActivity": 1714300005000 },
    { "name": "worker", "status": "crashed", "errorCount": 1, "lastActivity": 1714300003000 }
  ]
}
```

Statuses: `running`, `stopped`, `crashed`, `restarting`.
