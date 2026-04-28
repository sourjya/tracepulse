# Phase 3: Multi-Process & Docker - Design

> **Hardening Reference:** See [Collector Pitfalls & Hardening Guide](../../../docs/references/collector-pitfalls-hardening.md) for known failure modes. Phase 3 adds process group kill for zombie prevention (Pitfall 1.2), inherits PYTHONUNBUFFERED (Pitfall 1.1), and uses Docker Engine API instead of fs.watch for container logs (avoiding Pitfall 2.2).

## Architecture Overview

Phase 3 introduces a **Service Registry** that sits between process collectors and the event buffer. Each collector (spawned process or Docker log stream) registers itself with the registry, which tracks service state and tags every event with its source service before forwarding to the shared ring buffer.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TracePulse MCP Server                          │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      MCP Transport Layer                         │  │
│  │  ┌─────────────┐              ┌──────────────────────────────┐  │  │
│  │  │ stdio (primary, always on) │  │ Streamable HTTP :9800 (opt-in) │  │  │
│  │  └─────────────┘              └──────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        MCP Tool Handlers                         │  │
│  │  get_errors (+ service filter)  │  list_services                │  │
│  │  get_server_logs  │  get_runtime_status  │  watch_for_errors    │  │
│  │  get_build_errors │  get_error_context   │  clear_errors        │  │
│  │  get_timeline                                                    │  │
│  └──────────────────────────┬───────────────────────────────────────┘  │
│                              │                                          │
│  ┌───────────────────────────▼──────────────────────────────────────┐  │
│  │                    Event Buffer (Ring Buffer)                     │  │
│  │  500 events max (shared across all services)                     │  │
│  │  Fingerprint index → dedup + occurrence counting                 │  │
│  │  Correlation engine (temporal grouping on read)                  │  │
│  └───────────────────────────▲──────────────────────────────────────┘  │
│                              │                                          │
│  ┌───────────────────────────┴──────────────────────────────────────┐  │
│  │              Secret Redaction → Error Parsers → Signal Scorer     │  │
│  └───────────────────────────▲──────────────────────────────────────┘  │
│                              │                                          │
│  ┌───────────────────────────┴──────────────────────────────────────┐  │
│  │                      Service Registry                             │  │
│  │  Tracks: name, status, error_count, last_activity per service    │  │
│  │  Tags every event with service name before pipeline entry        │  │
│  └──────┬──────────────────┬──────────────────┬─────────────────────┘  │
│         │                  │                  │                         │
│  ┌──────▼──────┐  ┌───────▼───────┐  ┌──────▼──────────┐             │
│  │ Process     │  │ Process       │  │ Docker Log      │             │
│  │ Collector   │  │ Collector     │  │ Collector       │             │
│  │ (api)       │  │ (worker)      │  │ (compose svcs)  │             │
│  └──────┬──────┘  └───────┬───────┘  └──────┬──────────┘             │
│         │                  │                  │                         │
│    child_process      child_process     Docker Engine API              │
│    stdout/stderr      stdout/stderr     /var/run/docker.sock           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Service Registry (`src/services/service-registry.ts`)

The central coordinator for all monitored services. It owns the lifecycle state machine and per-service counters.

```typescript
/**
 * Represents a single monitored service's metadata.
 * Stored in the ServiceRegistry, updated by collectors on every event.
 */
interface ServiceEntry {
  /** Service name from config, CLI args, or Docker Compose service name */
  readonly name: string;
  /** Current lifecycle state */
  status: ServiceStatus;
  /** Total errors since TracePulse started (not reset by clear_errors) */
  errorCount: number;
  /** Unix ms timestamp of the most recent event from this service */
  lastActivity: number;
  /** Source type - determines which collector manages this service */
  readonly sourceType: "process" | "docker";
}

/** Service lifecycle states */
type ServiceStatus = "running" | "stopped" | "crashed" | "restarting";
```

**State machine:**
```
                    ┌──────────┐
         start ──► │ running  │ ◄── restart detected
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
         exit(0)    exit(N>0)   SIGTERM
              │          │          │
              ▼          ▼          ▼
         ┌─────────┐ ┌────────┐ ┌─────────┐
         │ stopped │ │crashed │ │ stopped │
         └─────────┘ └───┬────┘ └─────────┘
                          │
                    auto-restart?
                          │
                          ▼
                    ┌────────────┐
                    │ restarting │ ──► running
                    └────────────┘
```

The registry exposes:
- `register(name, sourceType)` - add a service
- `updateStatus(name, status)` - transition state
- `recordEvent(name)` - increment error count, update lastActivity
- `getServices()` - return all ServiceEntry objects (for `list_services` tool)
- `getService(name)` - return a single entry or undefined

### 2. Multi-Process Collector (`src/collectors/multi-process-collector.ts`)

Extends the existing single-process spawner (from Phase 1) to manage multiple child processes. Each process gets its own stdout/stderr listeners that tag events with the service name.

**Design decisions:**
- Each child process is spawned with `{ stdio: ['ignore', 'pipe', 'pipe'] }` - stdin is ignored, stdout/stderr are piped
- Each child process is spawned with `detached: true` and killed via `process.kill(-pid, signal)` to ensure the entire process group is terminated, including background workers spawned by the dev server (e.g., webpack workers, esbuild threads). _(Pitfall 1.2 from [Collector Pitfalls Guide](../../../docs/references/collector-pitfalls-hardening.md))_
- The spawner sets `PYTHONUNBUFFERED=1` in each child's environment (inherited from Phase 1 hardening, Pitfall 1.1)
- Process exit events update the service registry status
- On SIGINT/SIGTERM, all child processes receive the signal in parallel, with a 5-second timeout before SIGKILL
- Hot-reload detection (from Phase 2) runs independently per service

### 3. Docker Log Collector (`src/collectors/docker-log-collector.ts`)

Connects to the Docker Engine API via the local Unix socket to tail container logs.

**Docker API interaction:**
```
GET /containers/{id}/logs?follow=true&stdout=true&stderr=true&timestamps=true&since={unix_ts}
```

- Uses Node.js `node:http` with a Unix socket connection (`{ socketPath: '/var/run/docker.sock' }`) - no external Docker client library needed
- Parses the Docker multiplexed stream format (8-byte header: stream type + frame size)
- Each log line is tagged with the compose service name (from container labels `com.docker.compose.service`)
- On container restart, the collector detects the new container ID via Docker events API and re-attaches

**Compose file parsing:**
- Reads `docker-compose.yml` (or `--file` path) to discover service names
- Uses a YAML parser to extract the `services` key - only service names are needed, not the full compose config
- Maps compose service names to running container IDs via `GET /containers/json?filters={"label":["com.docker.compose.service={name}"]}`

### 4. Config Schema (`src/config/config-schema.ts`)

```typescript
/**
 * TracePulse configuration file schema.
 * Loaded from tracepulse.config.json in the project root,
 * or from the path specified via --config CLI flag.
 */
interface TracePulseConfig {
  /** List of services to monitor. Each gets its own child process. */
  services?: ServiceConfig[];

  /** Docker Compose integration settings */
  compose?: ComposeConfig;

  /** Transport configuration */
  transport?: TransportConfig;

  /** Fingerprint persistence settings */
  persist?: boolean;

  /** Cross-service correlation time window in milliseconds (default: 2000) */
  correlation_window_ms?: number;
}

interface ServiceConfig {
  /** Unique service name - used in event tagging and MCP tool filters */
  name: string;
  /** Shell command to spawn the service */
  command: string;
}

interface ComposeConfig {
  /** Path to docker-compose.yml (default: "docker-compose.yml") */
  file?: string;
}

interface TransportConfig {
  /** Enable Streamable HTTP transport alongside stdio */
  http?: boolean;
  /** HTTP transport port (default: 9800) */
  http_port?: number;
}
```

**Config file example (`tracepulse.config.json`):**
```json
{
  "services": [
    { "name": "api", "command": "npm run dev:api" },
    { "name": "worker", "command": "npm run dev:worker" },
    { "name": "frontend", "command": "npm run dev:frontend" }
  ],
  "transport": {
    "http": true,
    "http_port": 9800
  },
  "persist": true,
  "correlation_window_ms": 2000
}
```

**Validation rules:**
- `services[].name` must be non-empty, unique, and contain only `[a-z0-9-]`
- `services[].command` must be non-empty
- `correlation_window_ms` must be 100–10000
- `transport.http_port` must be 1024–65535
- If both `services` and `compose` are specified, error - they are mutually exclusive modes

### 5. Config Loader (`src/config/config-loader.ts`)

Resolves configuration from multiple sources with this precedence (highest wins):
1. CLI flags (`--service`, `--http-port`, `--persist`, etc.)
2. Config file (`tracepulse.config.json` or `--config` path)
3. Defaults

The loader validates the merged config against the schema and returns a typed, frozen config object. Invalid configs produce clear error messages to stderr and exit with code 1.

### 6. Cross-Service Correlation Engine (`src/correlation/correlation-engine.ts`)

Computes temporal correlation groups on read - no stored state.

**Algorithm:**
1. Sort events by timestamp
2. Walk events in order; start a new group when the gap between consecutive events exceeds `correlation_window_ms`
3. Assign a deterministic `correlation_group` ID (hash of the first event's timestamp + fingerprints in the group)
4. Only events from different services within the same group are considered correlated
5. Single-service groups get no `correlation_group` annotation

This is computed lazily when `get_errors` is called, not on event ingestion. The window is configurable per-request (with config default as fallback).

### 7. Streamable HTTP Transport (`src/transport/http-transport.ts`)

Uses `@modelcontextprotocol/sdk`'s built-in Streamable HTTP transport support.

**Design:**
- Creates an HTTP server on `127.0.0.1:9800` (configurable)
- Registers the same MCP tool handlers as the stdio transport
- Both transports share the same event buffer and service registry (singleton instances)
- The HTTP server is created only when `--http` flag or `transport.http: true` config is present
- Graceful shutdown closes the HTTP server before forwarding signals to child processes

### 8. Fingerprint Persistence (`src/persistence/fingerprint-store.ts`)

```typescript
/**
 * Schema for the persisted fingerprint history file.
 * Written to .tracepulse/fingerprints.json on graceful shutdown.
 * Read on startup to restore historical fingerprint data.
 */
interface PersistedFingerprintEntry {
  /** The fingerprint hash string */
  fingerprint: string;
  /** Unix ms - first time this fingerprint was ever seen */
  first_seen: number;
  /** Unix ms - most recent occurrence */
  last_seen: number;
  /** Total occurrences across all sessions */
  total_count: number;
}

interface FingerprintFile {
  /** Schema version for forward compatibility */
  version: 1;
  /** ISO 8601 timestamp of when this file was written */
  written_at: string;
  /** Fingerprint entries, ordered by last_seen descending */
  fingerprints: PersistedFingerprintEntry[];
}
```

**Behavior:**
- On startup (if `persist` enabled): read `.tracepulse/fingerprints.json`, merge into in-memory fingerprint index
- On graceful shutdown: write current fingerprint index to `.tracepulse/fingerprints.json`
- If file is corrupted/unreadable: log warning to stderr, start with empty history
- Cap at 5,000 entries; evict least-recently-seen entries when full
- File contains only hashes, timestamps, and counts - never raw error messages (security: NFR-4)

---

## MCP Tool Changes

### Extended: `get_errors`

```typescript
/**
 * get_errors - retrieve recent runtime errors from the event buffer.
 *
 * Phase 3 adds the `service` filter parameter and `correlation_group`
 * annotation on returned events.
 */
interface GetErrorsParams {
  /** Return events after this Unix ms timestamp */
  since?: number;
  /** Filter by event source: "server-stdout" | "server-stderr" | "build-error" | "docker-log" */
  source?: string;
  /** Filter by service name (e.g., "api", "worker"). Omit for all services. */
  service?: string;
  /** Max events to return (default: 20) */
  limit?: number;
}

/** Response events include an optional correlation_group when cross-service correlation applies */
interface RuntimeEventWithCorrelation extends RuntimeEvent {
  /** Shared ID for temporally correlated events across services. Absent for uncorrelated events. */
  correlation_group?: string;
}
```

### New: `list_services`

```typescript
/**
 * list_services - return the status of all monitored services.
 *
 * Gives the agent a topology view of the dev environment before
 * drilling into specific errors.
 */
interface ListServicesResult {
  services: Array<{
    /** Service name */
    name: string;
    /** Current status: "running" | "stopped" | "crashed" | "restarting" */
    status: string;
    /** Total error-level events from this service since TracePulse started */
    error_count: number;
    /** Unix ms timestamp of the most recent event from this service */
    last_activity: number;
  }>;
}
```

---

## CLI Changes

### New: `compose` subcommand

```
npx tracepulse compose [--file <path>] [--http] [--http-port <port>] [--persist]
```

- `--file` - path to docker-compose.yml (default: `docker-compose.yml` in cwd)
- Discovers services from the compose file, tails their container logs

### Extended: `start` subcommand

```
npx tracepulse start [command] [--service name=command ...] [--config <path>] [--http] [--http-port <port>] [--persist]
```

- Positional `command` - single-process mode (Phase 1/2 behavior, unchanged)
- `--service name=command` - multi-process mode (repeatable flag)
- `--config <path>` - load config file (default: `tracepulse.config.json` in cwd if it exists)
- `--http` - enable Streamable HTTP transport
- `--http-port <port>` - HTTP transport port (default: 9800)
- `--persist` - enable fingerprint persistence

### Mutual exclusivity

| Mode | Trigger | Error if combined with |
|---|---|---|
| Single-process | `start "command"` | `--service`, `--config` with `services` |
| Multi-process (CLI) | `start --service a="cmd" --service b="cmd"` | positional command, `--config` with `services` |
| Multi-process (config) | `start --config tracepulse.config.json` | positional command, `--service` |
| Docker Compose | `compose --file docker-compose.yml` | `start` subcommand |

---

## Data Flow

### Multi-Process Mode

```
tracepulse.config.json
        │
        ▼
  Config Loader ──► validates ──► TracePulseConfig
        │
        ▼
  For each service in config.services:
        │
        ├──► spawn child_process(command)
        │         │
        │         ├── stdout ──► line splitter ──► service tag ──► redaction ──► parser ──► scorer ──► buffer
        │         └── stderr ──► line splitter ──► service tag ──► redaction ──► parser ──► scorer ──► buffer
        │
        └──► register in ServiceRegistry
```

### Docker Compose Mode

```
docker-compose.yml
        │
        ▼
  YAML parser ──► extract service names
        │
        ▼
  For each service:
        │
        ├──► GET /containers/json?filters=... ──► find container ID
        │
        ├──► GET /containers/{id}/logs?follow=true ──► stream
        │         │
        │         └── demux stream ──► line splitter ──► service tag ──► redaction ──► parser ──► scorer ──► buffer
        │
        └──► register in ServiceRegistry
```

---

## File Structure (New/Modified)

```
src/
├── collectors/
│   ├── multi-process-collector.ts    # NEW - spawns and manages multiple child processes
│   └── docker-log-collector.ts       # NEW - tails Docker container logs via Engine API
├── config/
│   ├── config-schema.ts              # NEW - TypeScript interfaces + validation
│   └── config-loader.ts              # NEW - reads config file, merges CLI flags, validates
├── correlation/
│   └── correlation-engine.ts         # NEW - temporal cross-service event grouping
├── persistence/
│   └── fingerprint-store.ts          # NEW - read/write .tracepulse/fingerprints.json
├── services/
│   └── service-registry.ts           # NEW - tracks service state, error counts, activity
├── transport/
│   └── http-transport.ts             # NEW - Streamable HTTP MCP transport on port 9800
├── constants/
│   └── services.ts                   # NEW - service-related constants (status values, defaults)
├── cli.ts                            # MODIFIED - add compose subcommand, --service, --config, --http, --persist flags
└── index.ts                          # MODIFIED - wire up registry, multi-process, transports

tests/
├── unit/
│   ├── services/
│   │   └── test-service-registry.ts
│   ├── config/
│   │   ├── test-config-schema.ts
│   │   └── test-config-loader.ts
│   ├── collectors/
│   │   ├── test-multi-process-collector.ts
│   │   └── test-docker-log-collector.ts
│   ├── correlation/
│   │   └── test-correlation-engine.ts
│   └── persistence/
│       └── test-fingerprint-store.ts
└── integration/
    ├── test-multi-process-flow.ts
    ├── test-docker-compose-flow.ts
    └── test-http-transport.ts
```

---

## Dependencies

### New Dependencies Required

| Package | Purpose | Justification |
|---|---|---|
| `yaml` | Parse docker-compose.yml | Standard YAML parser. Node.js has no built-in YAML support. Needed for compose service discovery. |

### No New Dependencies Needed For

| Concern | Approach |
|---|---|
| Docker Engine API | `node:http` with Unix socket - no Docker client library needed |
| HTTP transport | `@modelcontextprotocol/sdk` has built-in Streamable HTTP support |
| Config file reading | `node:fs` + `JSON.parse` - config is JSON, not YAML |
| Fingerprint persistence | `node:fs` + `JSON.parse`/`JSON.stringify` |
| Child process management | `node:child_process` (already used in Phase 1) |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Config file not found (when `--config` specified) | Exit with code 1, clear error to stderr |
| Config file not found (default path, not specified) | Silently continue without config |
| Config validation failure | Exit with code 1, list all validation errors to stderr |
| Docker socket not available | Exit with code 1: "Docker is not running or /var/run/docker.sock is not accessible" |
| Docker container not found for a compose service | Log warning to stderr, skip that service, continue with others |
| Child process fails to spawn (bad command) | Log error to stderr, mark service as "crashed", continue with others |
| HTTP port already in use | Exit with code 1: "Port 9800 is already in use. Use --http-port to specify a different port." |
| Fingerprint file corrupted | Log warning to stderr, start with empty history |
| Fingerprint file write fails on shutdown | Log warning to stderr, exit normally (don't block shutdown) |
