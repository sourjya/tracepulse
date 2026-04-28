# Phase 3: Multi-Process & Docker — Requirements

## Overview

Phase 3 extends TracePulse from single-process monitoring to real-world multi-service dev setups. Developers running API + worker + frontend (or Docker Compose stacks) get unified error visibility across all services, with each error tagged to its source service.

**Prerequisite:** Phase 2 (Watch Mode) complete and merged to main.

---

## User Stories

### US-1: Multi-Process Monitoring via Config File

**As** a developer running multiple services locally (API, worker, frontend),
**I want** TracePulse to spawn and monitor all of them from a single config file,
**So that** my AI agent sees errors from any service without me running multiple TracePulse instances.

**Acceptance Criteria:**
1. TracePulse reads `tracepulse.config.json` from the project root (or path specified via `--config`)
2. Each service entry has `name` (string, required) and `command` (string, required)
3. TracePulse spawns each service as a separate child process and captures stdout/stderr independently
4. If a service crashes, TracePulse injects a synthetic error event with the service name and exit code
5. If a service restarts (hot-reload), TracePulse continues capturing without interruption
6. `Ctrl+C` (SIGINT) forwards the signal to all child processes and waits up to 5 seconds per process before SIGKILL
7. Config validation rejects duplicate service names, empty commands, and missing required fields with clear error messages to stderr

### US-2: Multi-Process Monitoring via CLI Args

**As** a developer who doesn't want a config file for a quick multi-service session,
**I want** to specify multiple services via CLI arguments,
**So that** I can monitor multiple processes without creating a config file.

**Acceptance Criteria:**
1. CLI syntax: `npx tracepulse start --service api="npm run dev:api" --service worker="npm run dev:worker"`
2. Each `--service name=command` pair creates a monitored service
3. Behavior is identical to config-file mode (US-1 acceptance criteria 3-6 apply)
4. If both `--config` and `--service` are provided, TracePulse exits with an error explaining the conflict

### US-3: Docker Compose Integration

**As** a developer using Docker Compose for local development,
**I want** TracePulse to auto-detect running containers and tail their logs,
**So that** my AI agent sees errors from all containers without manual setup.

**Acceptance Criteria:**
1. CLI syntax: `npx tracepulse compose --file docker-compose.yml` (defaults to `docker-compose.yml` in cwd)
2. TracePulse parses the compose file to discover service names
3. TracePulse tails logs from each container using the Docker Engine API (not `docker logs` CLI)
4. Each log line is tagged with the container's service name
5. If a container restarts, TracePulse re-attaches to the new container's log stream automatically
6. If Docker is not running or the compose file is invalid, TracePulse exits with a clear error to stderr
7. TracePulse does NOT start/stop containers — it only observes running ones

### US-4: Service Labeling on Events

**As** an AI agent querying TracePulse,
**I want** every `RuntimeEvent` to include a `service` field identifying which process/container produced it,
**So that** I can distinguish errors from the API vs the worker vs the frontend.

**Acceptance Criteria:**
1. Every `RuntimeEvent` has a `service` field (string)
2. For single-process mode (Phase 1/2), `service` defaults to `"main"`
3. For multi-process mode, `service` matches the name from config or CLI args
4. For Docker Compose mode, `service` matches the compose service name
5. The `get_errors` MCP tool accepts an optional `service` filter parameter
6. When `service` filter is provided, only events from that service are returned

### US-5: Service Listing Tool

**As** an AI agent,
**I want** to query which services TracePulse is monitoring and their current status,
**So that** I can understand the dev environment topology before investigating errors.

**Acceptance Criteria:**
1. New MCP tool: `list_services()` returns an array of service descriptors
2. Each descriptor includes: `name` (string), `status` (string: `"running"` | `"stopped"` | `"crashed"` | `"restarting"`), `error_count` (number), `last_activity` (number, Unix ms timestamp)
3. `error_count` reflects errors since TracePulse started (not since last clear)
4. `last_activity` is the timestamp of the most recent event from that service
5. In single-process mode, returns a single entry with `name: "main"`

### US-6: Cross-Service Error Correlation

**As** an AI agent investigating a failure that spans multiple services,
**I want** errors from different services that occurred in the same time window to be grouped,
**So that** I can see the cascade of failures across services.

**Acceptance Criteria:**
1. When `get_errors` returns events, events from different services within a configurable time window (default: 2 seconds) are annotated with a shared `correlation_group` ID
2. The correlation is based on temporal proximity — errors within the window get the same group ID
3. Correlation groups are computed on read (not stored), so the window can be adjusted
4. The `correlation_window_ms` is configurable in `tracepulse.config.json` (default: 2000)
5. Single-service mode is unaffected (no correlation needed with only one service)

### US-7: Streamable HTTP Transport

**As** a developer or tool author who needs multiple clients to connect to TracePulse simultaneously,
**I want** TracePulse to expose a Streamable HTTP transport alongside stdio,
**So that** a dashboard, a second agent, or a browser extension can connect without disrupting the primary agent's stdio connection.

**Acceptance Criteria:**
1. TracePulse starts a Streamable HTTP MCP transport on port 9800 (configurable via `--http-port` or config)
2. The HTTP transport exposes the same MCP tools as stdio
3. Multiple HTTP clients can connect simultaneously
4. stdio remains the primary transport and is always active
5. HTTP transport is opt-in: enabled via `--http` flag or `"transport": { "http": true }` in config
6. HTTP transport binds to `127.0.0.1` only (no external access by default)

### US-8: Optional Fingerprint Persistence

**As** a developer returning to a project after a break,
**I want** TracePulse to remember which error fingerprints it has seen before,
**So that** my AI agent can distinguish genuinely new errors from recurring ones.

**Acceptance Criteria:**
1. On graceful shutdown (SIGINT/SIGTERM), TracePulse writes fingerprint history to `.tracepulse/fingerprints.json`
2. On startup, TracePulse reads `.tracepulse/fingerprints.json` if it exists
3. Each fingerprint entry stores: `fingerprint` (string), `first_seen` (Unix ms), `last_seen` (Unix ms), `total_count` (number)
4. Persistence is opt-in: enabled via `--persist` flag or `"persist": true` in config
5. If `.tracepulse/` directory doesn't exist, TracePulse creates it
6. If the JSON file is corrupted or unreadable, TracePulse logs a warning to stderr and starts with an empty fingerprint history (no crash)
7. `.tracepulse/` is added to `.gitignore` recommendations in docs

---

## Non-Functional Requirements

### NFR-1: Startup Performance

TracePulse must start all configured services and begin capturing logs within 3 seconds of invocation (excluding service startup time). Docker Compose mode must begin tailing within 5 seconds of invocation.

### NFR-2: Memory Efficiency

The ring buffer remains capped at 500 events total (shared across all services). Per-service event counts are tracked via lightweight counters, not separate buffers. Fingerprint persistence file must not exceed 1 MB (enforced by capping stored fingerprints at 5,000 entries, LRU eviction).

### NFR-3: Graceful Degradation

If one service in a multi-process setup crashes, TracePulse continues monitoring all other services. If Docker connectivity is lost mid-session, TracePulse logs the disconnection and continues monitoring any non-Docker services. No single service failure should bring down the entire TracePulse process.

### NFR-3A: Process Tree Cleanup (from [Collector Pitfalls Guide](../../../docs/references/collector-pitfalls-hardening.md))

- **NFR-3A.1:** When using multi-process mode, TracePulse must kill the entire process group for each service on shutdown. Background workers spawned by dev servers (e.g., webpack workers, esbuild threads) must not survive TracePulse exit. _(Pitfall 1.2)_
- **NFR-3A.2:** Docker volume-mounted log files may not trigger `fs.watch` events. The Docker log collector uses the Docker Engine API (streaming HTTP), which is not affected. Document this as a reason to prefer `compose` mode over `attach --log-file` for Docker setups. _(Pitfall 2.2)_

### NFR-4: Security

- Secret redaction (from Phase 1) applies to ALL services and Docker container logs before events enter the ring buffer
- HTTP transport binds to localhost only; no TLS required for localhost-only binding
- Fingerprint persistence file must not contain raw error messages — only fingerprint hashes, timestamps, and counts
- Docker API access uses the local socket (`/var/run/docker.sock`) — no remote Docker hosts

### NFR-5: Backward Compatibility

- Single-process mode (`npx tracepulse start "npm run dev"`) must work identically to Phase 2
- All Phase 1/2 MCP tools must continue working without changes
- The `service` field on `RuntimeEvent` defaults to `"main"` in single-process mode
- No new required configuration — all Phase 3 features are opt-in

### NFR-6: Agent Compatibility

All MCP tools must work with any MCP-compatible agent (Kiro, Claude Code, Cursor, Copilot, Cline, Windsurf). No agent-specific code. Tool descriptions must be self-documenting so agents understand parameters without external docs.

### NFR-7: HTTP Transport Performance

Streamable HTTP transport must handle at least 10 concurrent client connections without degradation. Response latency for MCP tool calls over HTTP must be under 100ms (excluding event collection time for `watch_for_errors`).

---

## Out of Scope

1. **Container lifecycle management** — TracePulse does NOT start, stop, or restart Docker containers. It only observes.
2. **Remote Docker hosts** — Only local Docker socket is supported. No TCP/TLS Docker connections.
3. **Kubernetes / Docker Swarm** — Only Docker Compose is supported. Orchestrator-level monitoring is deferred.
4. **Service dependency graphs** — No automatic detection of which service calls which. Correlation is temporal only.
5. **Custom Docker log drivers** — Only the default JSON-file log driver is supported. Syslog, fluentd, etc. are not parsed.
6. **Authentication on HTTP transport** — Localhost-only binding is the security model. No auth tokens or TLS for Phase 3.
7. **Config file hot-reload** — Changing `tracepulse.config.json` requires restarting TracePulse. Live config reload is deferred.
8. **Service health checks** — TracePulse does not ping services or check HTTP endpoints. Status is derived from process/container state only.
9. **Frontend-backend HTTP correlation** — This is Phase 4 scope. Phase 3 correlation is temporal proximity only.
10. **MCP push notifications** — Phase 5 scope. Phase 3 is pull-only.
