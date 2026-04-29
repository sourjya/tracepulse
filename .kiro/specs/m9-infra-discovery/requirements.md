# M9: Infrastructure Discovery & Health - Spec

## Overview

Parse local config files to discover backend infrastructure (databases, caches, queues, storage), verify connectivity with non-blocking TCP/HTTP checks, and present structured health information to the agent.

## Design Principles

1. **Non-blocking** - all checks use async I/O with timeouts. Never blocks the MCP event loop.
2. **Read-only** - only reads config files and checks TCP connectivity. Never connects to databases, never runs queries, never modifies state.
3. **No new dependencies** - uses `node:net` for TCP, `node:http` for HTTP, `node:fs` for file reading.
4. **Progressive disclosure** - summary first (cheap), details on demand (per-service).
5. **Cached results** - probes run on a schedule (every 60s), tools read from cache. No probe on every tool call.

---

## Architecture

```
Startup:
  1. Scan for config files (.env, docker-compose.yml, etc.)
  2. Parse service URLs/hosts/ports from config
  3. Start background probe loop (every 60s)

Background probe (async, non-blocking):
  For each discovered service (in parallel):
    - TCP connect with 2s timeout
    - Record: reachable/unreachable, latency_ms, error
    - Store result in memory cache

MCP tool calls (instant, reads cache):
  get_infra_status()     -> summary of all services
  get_infra_detail(name) -> detail for one service
```

### Thread Safety

Node.js is single-threaded. The probe loop uses `Promise.all` with individual `setTimeout` guards per service. Each probe is a standalone `net.connect()` or `http.get()` that resolves/rejects independently. No shared mutable state during probing - results are written atomically to the cache after all probes complete.

```
Probe cycle:
  const results = await Promise.all(services.map(probe))  // parallel, non-blocking
  cache = results  // atomic swap, no partial state
```

### Won't Lock MCP

- Probes use `net.connect()` with 2s socket timeout - if a service is down, it fails fast
- `Promise.all` runs all probes in parallel - total time = slowest service (max 2s)
- Probe runs on `setInterval` with `.unref()` - doesn't prevent process exit
- MCP tool calls read from cache (0ms) - never wait for a probe

---

## Config File Parsing

### Supported files (checked in order)

| File | What we extract |
|------|----------------|
| `.env` / `.env.local` / `.env.development` | `*_URL`, `*_HOST`, `*_PORT` variables |
| `docker-compose.yml` / `docker-compose.yaml` | Service names + port mappings |
| `tracepulse.config.json` | Explicit service definitions (if added) |

### URL Pattern Extraction

From `.env`:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
REDIS_URL=redis://localhost:6379/0
ELASTICSEARCH_URL=http://localhost:9200
CELERY_BROKER_URL=amqp://guest:guest@localhost:5672
S3_ENDPOINT=http://localhost:9000
MONGO_URI=mongodb://localhost:27017/mydb
```

Parsed into:
```typescript
[
  { name: "PostgreSQL", host: "localhost", port: 5432, protocol: "postgresql", source: ".env:DATABASE_URL" },
  { name: "Redis", host: "localhost", port: 6379, protocol: "redis", source: ".env:REDIS_URL" },
  { name: "Elasticsearch", host: "localhost", port: 9200, protocol: "http", source: ".env:ELASTICSEARCH_URL" },
  { name: "RabbitMQ", host: "localhost", port: 5672, protocol: "amqp", source: ".env:CELERY_BROKER_URL" },
  { name: "S3/MinIO", host: "localhost", port: 9000, protocol: "http", source: ".env:S3_ENDPOINT" },
  { name: "MongoDB", host: "localhost", port: 27017, protocol: "mongodb", source: ".env:MONGO_URI" },
]
```

### Protocol-to-Name Mapping

| Protocol/Port | Service Name |
|--------------|-------------|
| postgresql, 5432 | PostgreSQL |
| mysql, 3306 | MySQL |
| redis, 6379 | Redis |
| amqp, 5672 | RabbitMQ |
| mongodb, 27017 | MongoDB |
| http + 9200 | Elasticsearch |
| http + 9000 | S3/MinIO |
| http + 8500 | Consul |
| http + 2181 | ZooKeeper |

---

## Connectivity Probing

### TCP Probe (for databases, Redis, RabbitMQ, etc.)

```typescript
function probeTcp(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.connect({ host, port });
    
    socket.setTimeout(timeoutMs);
    
    socket.on("connect", () => {
      socket.destroy();
      resolve({ status: "reachable", latency_ms: Date.now() - start });
    });
    
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ status: "timeout", latency_ms: timeoutMs, error: `timeout after ${timeoutMs}ms` });
    });
    
    socket.on("error", (err) => {
      resolve({ status: "unreachable", latency_ms: Date.now() - start, error: err.message });
    });
  });
}
```

### HTTP Probe (for Elasticsearch, S3, web services)

```typescript
function probeHttp(url: string, timeoutMs: number): Promise<ProbeResult> {
  // GET with timeout, check for any 2xx/3xx response
  // Don't read body - just check status code
}
```

---

## MCP Tools

### `get_infra_status` - Summary (cheap, ~100 tokens)

```json
{
  "summary": "4/5 services reachable, 1 unreachable, 0 missing env vars",
  "services": [
    { "name": "PostgreSQL", "status": "reachable", "latency_ms": 2, "source": ".env:DATABASE_URL" },
    { "name": "Redis", "status": "reachable", "latency_ms": 1, "source": ".env:REDIS_URL" },
    { "name": "Elasticsearch", "status": "unreachable", "error": "connection refused", "source": ".env:ELASTICSEARCH_URL" },
    { "name": "RabbitMQ", "status": "reachable", "latency_ms": 3, "source": ".env:CELERY_BROKER_URL" },
    { "name": "S3/MinIO", "status": "reachable", "latency_ms": 5, "source": ".env:S3_ENDPOINT" }
  ],
  "last_probed_at": 1714300060000,
  "probe_interval_seconds": 60
}
```

Agent sees at a glance: Elasticsearch is down. Everything else is fine.

### `get_infra_detail` - Per-service detail (on demand, ~200 tokens)

```json
{
  "name": "PostgreSQL",
  "host": "localhost",
  "port": 5432,
  "protocol": "postgresql",
  "status": "reachable",
  "latency_ms": 2,
  "source": ".env:DATABASE_URL",
  "config_value": "postgresql://user:[REDACTED]@localhost:5432/mydb",
  "history": [
    { "status": "reachable", "latency_ms": 2, "checked_at": 1714300060000 },
    { "status": "reachable", "latency_ms": 3, "checked_at": 1714300000000 },
    { "status": "unreachable", "error": "connection refused", "checked_at": 1714299940000 }
  ]
}
```

Note: `config_value` has credentials redacted by the secret redactor.

---

## Security

- **Credentials redacted** in all responses (reuses existing secret redactor)
- **Read-only** - never connects to databases, never runs queries
- **TCP only** - just checks if the port accepts connections
- **Localhost bias** - most dev services are on localhost. Remote hosts work but are less common in dev.
- **No new dependencies** - `node:net` and `node:http` only

---

## Implementation Plan

### Files to create

| File | Purpose |
|------|---------|
| `src/infra/config-scanner.ts` | Parse .env and docker-compose for service URLs |
| `src/infra/service-prober.ts` | TCP/HTTP connectivity checks |
| `src/infra/infra-monitor.ts` | Background probe loop + cache |
| `src/tools/get-infra-status.ts` | MCP tool handler (summary) |
| `src/tools/get-infra-detail.ts` | MCP tool handler (per-service) |

### Tasks

- [ ] 1. Config scanner: parse .env files for URL patterns
- [ ] 2. Config scanner: protocol-to-name mapping
- [ ] 3. Service prober: TCP probe with timeout
- [ ] 4. Service prober: HTTP probe with timeout
- [ ] 5. Infra monitor: background loop with cache
- [ ] 6. get_infra_status tool handler
- [ ] 7. get_infra_detail tool handler
- [ ] 8. Register tools in MCP server
- [ ] 9. Wire into CLI startup
- [ ] 10. Tests
