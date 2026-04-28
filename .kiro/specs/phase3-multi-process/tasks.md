# Implementation Plan: Phase 3 - Multi-Process & Docker

## Overview

Extend TracePulse from single-process monitoring to multi-service dev environments. Adds multi-process spawning, Docker Compose log tailing, service registry, cross-service correlation, Streamable HTTP transport, and optional fingerprint persistence.

**Architecture References:**
- `docs/ideas/feature-architecture-analysis.md` - Phase 3 feature set, architecture decisions
- `.kiro/specs/phase3-multi-process/design.md` - component design, data flow, file structure
- `.kiro/specs/phase3-multi-process/requirements.md` - user stories US-1 through US-8, NFRs

**Key Principles:**
- All Phase 1/2 behavior must remain unchanged (NFR-5: backward compatibility)
- Single-process mode is unaffected - all Phase 3 features are opt-in
- stdout is reserved for MCP JSON-RPC; all diagnostic output goes to stderr
- Secret redaction applies to ALL services and Docker logs before buffer entry

**Development Approach - TDD MANDATORY:**
- **RED → GREEN → REFACTOR**: Write failing tests FIRST, then minimal implementation, then refactor
- NEVER write implementation code before its test
- Each phase below follows strict TDD ordering: tests before implementation
- See `testing-standards.md` for complete TDD guidelines

**Testing Strategy:**
- Unit tests for all new modules (registry, config, collectors, correlation, persistence)
- Integration tests for multi-process flow, Docker flow, HTTP transport
- All tests use vitest; no external test infrastructure required for unit tests

## Tasks

### Phase 1: Service Registry & Constants

#### Step 1: Service Constants - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 1.1 Write unit tests for service constants
  - Test that `ServiceStatus` enum contains exactly: `running`, `stopped`, `crashed`, `restarting`
  - Test that default `CORRELATION_WINDOW_MS` is 2000
  - Test that `MAX_PERSISTED_FINGERPRINTS` is 5000
  - Test that `DEFAULT_HTTP_PORT` is 9800
  - File: `tests/unit/constants/test-services-constants.ts`
  - _Requirements: US-5, US-6, US-7_

**GREEN Phase: Implement to Pass Tests**
- [ ] 1.2 Implement service constants
  - Create `src/constants/services.ts`
  - Define `ServiceStatus` enum, correlation defaults, persistence limits, transport defaults
  - _Requirements: US-5, US-6, US-7, US-8_

#### Step 2: Service Registry - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 2.1 Write unit tests for ServiceRegistry
  - Test `register(name, sourceType)` adds a service with status `running`
  - Test `register` with duplicate name throws
  - Test `updateStatus(name, status)` transitions state correctly
  - Test `updateStatus` with unknown service name throws
  - Test `recordEvent(name)` increments `errorCount` and updates `lastActivity`
  - Test `getServices()` returns all registered services
  - Test `getService(name)` returns single entry or undefined
  - Test initial state: `errorCount` is 0, `lastActivity` is 0
  - Test single-process mode: registry has one entry with name `"main"`
  - File: `tests/unit/services/test-service-registry.ts`
  - _Requirements: US-4, US-5_

**GREEN Phase: Implement to Pass Tests**
- [ ] 2.2 Implement ServiceRegistry
  - Create `src/services/service-registry.ts`
  - Implement `ServiceEntry` interface and `ServiceRegistry` class
  - Methods: `register`, `updateStatus`, `recordEvent`, `getServices`, `getService`
  - _Requirements: US-4, US-5_

**REFACTOR Phase**
- [ ] 2.3 Refactor ServiceRegistry if needed
  - Ensure immutable return types from `getServices` / `getService`
  - Verify all tests still pass

#### Checkpoint: Phase 1 Complete

- [ ] All tests passing (`npm run test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 2: Configuration System

#### Step 3: Config Schema & Validation - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 3.1 Write unit tests for config schema validation
  - Test valid config with services array passes validation
  - Test valid config with compose section passes validation
  - Test empty config (all optional) passes validation
  - Test duplicate service names rejected with clear error
  - Test empty service name rejected
  - Test empty service command rejected
  - Test service name with invalid characters rejected (only `[a-z0-9-]` allowed)
  - Test `correlation_window_ms` outside 100–10000 rejected
  - Test `transport.http_port` outside 1024–65535 rejected
  - Test mutual exclusivity: services + compose together rejected
  - File: `tests/unit/config/test-config-schema.ts`
  - _Requirements: US-1, US-6, US-7_

**GREEN Phase: Implement to Pass Tests**
- [ ] 3.2 Implement config schema and validation
  - Create `src/config/config-schema.ts`
  - Define `TracePulseConfig`, `ServiceConfig`, `ComposeConfig`, `TransportConfig` interfaces
  - Implement `validateConfig(config: unknown): TracePulseConfig` with detailed error messages
  - _Requirements: US-1, US-6, US-7_

#### Step 4: Config Loader - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 4.1 Write unit tests for config loader
  - Test loading config from explicit `--config` path
  - Test loading config from default `tracepulse.config.json` in cwd
  - Test missing explicit config file exits with error
  - Test missing default config file silently returns empty config
  - Test CLI flags override config file values
  - Test `--service name=command` parsing produces correct ServiceConfig array
  - Test conflict: positional command + `--service` flags rejected
  - Test conflict: positional command + config file with `services` rejected
  - Test conflict: `--service` flags + config file with `services` rejected
  - File: `tests/unit/config/test-config-loader.ts`
  - _Requirements: US-1, US-2_

**GREEN Phase: Implement to Pass Tests**
- [ ] 4.2 Implement config loader
  - Create `src/config/config-loader.ts`
  - Implement `loadConfig(cliArgs): TracePulseConfig` - reads file, merges CLI flags, validates
  - Handle precedence: CLI flags > config file > defaults
  - _Requirements: US-1, US-2_

**REFACTOR Phase**
- [ ] 4.3 Refactor config system if needed
  - Ensure config object is frozen after creation
  - Verify all tests still pass

#### Checkpoint: Phase 2 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 3: Multi-Process Collector

#### Step 5: Multi-Process Collector - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 5.1 Write unit tests for MultiProcessCollector
  - Test spawning a single service registers it in the ServiceRegistry
  - Test spawning multiple services registers all in the ServiceRegistry
  - Test stdout lines from a service are tagged with the correct service name
  - Test stderr lines from a service are tagged with the correct service name
  - Test child process exit with code 0 sets service status to `stopped`
  - Test child process exit with non-zero code sets service status to `crashed`
  - Test child process exit injects synthetic error event with exit code
  - Test `shutdown()` sends SIGTERM to all child processes
  - Test `shutdown()` sends SIGKILL after 5-second timeout if process doesn't exit
  - Test `shutdown()` kills entire process group (not just direct child) - verify grandchild processes are also terminated _(Pitfall 1.2)_
  - File: `tests/unit/collectors/test-multi-process-collector.ts`
  - _Requirements: US-1, US-2, US-4_

**GREEN Phase: Implement to Pass Tests**
- [ ] 5.2 Implement MultiProcessCollector
  - Create `src/collectors/multi-process-collector.ts`
  - Spawn each service as a child process with piped stdout/stderr
  - Register each service in the ServiceRegistry
  - Tag every line with the service name before forwarding to the event pipeline
  - Handle process exit: update registry status, inject synthetic events
  - Implement `shutdown()` with SIGTERM → 5s timeout → SIGKILL
  - _Requirements: US-1, US-2, US-4_

#### Step 6: CLI Integration for Multi-Process - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 6.1 Write unit tests for CLI multi-process argument parsing
  - Test `--service api="npm run dev:api"` parses to `{ name: "api", command: "npm run dev:api" }`
  - Test multiple `--service` flags produce array of ServiceConfig
  - Test `--config path` flag is captured
  - Test `--http` flag is captured
  - Test `--http-port 9801` flag is captured
  - Test `--persist` flag is captured
  - File: `tests/unit/test-cli-args.ts`
  - _Requirements: US-2, US-7, US-8_

**GREEN Phase: Implement to Pass Tests**
- [ ] 6.2 Extend CLI to support multi-process flags
  - Modify `src/cli.ts` - add `--service`, `--config`, `--http`, `--http-port`, `--persist` flags
  - Wire CLI args into config loader
  - _Requirements: US-2, US-7, US-8_

**REFACTOR Phase**
- [ ] 6.3 Refactor collector and CLI if needed
  - Ensure single-process mode still works identically (backward compat)
  - Verify all tests still pass

#### Checkpoint: Phase 3 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Single-process mode regression test passes
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 4: Docker Compose Integration

#### Step 7: Docker Log Collector - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 7.1 Write unit tests for DockerLogCollector
  - Test parsing Docker multiplexed stream format (8-byte header + payload)
  - Test stdout stream type (0x01) is tagged as `server-stdout`
  - Test stderr stream type (0x02) is tagged as `server-stderr`
  - Test service name extracted from container labels (`com.docker.compose.service`)
  - Test each log line is tagged with the correct compose service name
  - Test collector registers each discovered service in the ServiceRegistry
  - Test graceful handling when Docker socket is not available
  - Test graceful handling when a container is not found for a compose service
  - File: `tests/unit/collectors/test-docker-log-collector.ts`
  - _Requirements: US-3, US-4_

**GREEN Phase: Implement to Pass Tests**
- [ ] 7.2 Implement DockerLogCollector
  - Create `src/collectors/docker-log-collector.ts`
  - Connect to Docker Engine API via `/var/run/docker.sock` using `node:http`
  - Parse compose file (YAML) to discover service names
  - Map service names to container IDs via Docker API label filter
  - Tail container logs with `follow=true`, demux the multiplexed stream
  - Tag each line with compose service name, forward to event pipeline
  - Register services in ServiceRegistry, handle container restart re-attachment
  - _Requirements: US-3, US-4_

#### Step 8: Compose CLI Subcommand - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 8.1 Write unit tests for `compose` subcommand parsing
  - Test `compose` subcommand is recognized
  - Test `--file path` flag is captured (default: `docker-compose.yml`)
  - Test `compose` + `--http` and `--persist` flags work together
  - File: `tests/unit/test-cli-compose.ts`
  - _Requirements: US-3_

**GREEN Phase: Implement to Pass Tests**
- [ ] 8.2 Implement `compose` CLI subcommand
  - Modify `src/cli.ts` - add `compose` subcommand with `--file` flag
  - Wire into DockerLogCollector via config loader
  - _Requirements: US-3_

**REFACTOR Phase**
- [ ] 8.3 Refactor Docker integration if needed
  - Ensure error messages for Docker failures are clear and actionable
  - Verify all tests still pass

#### Checkpoint: Phase 4 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 5: Cross-Service Correlation

#### Step 9: Correlation Engine - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 9.1 Write unit tests for CorrelationEngine
  - Test events from two services within 2000ms get the same `correlation_group`
  - Test events from two services separated by >2000ms get different groups
  - Test events from a single service get no `correlation_group` (even if close in time)
  - Test custom `correlation_window_ms` is respected
  - Test empty event list returns empty result
  - Test single event returns no correlation group
  - Test `correlation_group` ID is deterministic (same inputs → same ID)
  - Test events are sorted by timestamp in output
  - File: `tests/unit/correlation/test-correlation-engine.ts`
  - _Requirements: US-6_

**GREEN Phase: Implement to Pass Tests**
- [ ] 9.2 Implement CorrelationEngine
  - Create `src/correlation/correlation-engine.ts`
  - Implement `correlate(events, windowMs): RuntimeEventWithCorrelation[]`
  - Sort by timestamp, group by temporal proximity, assign deterministic group IDs
  - Only annotate groups that span multiple services
  - _Requirements: US-6_

#### Step 10: Wire Correlation into `get_errors` - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 10.1 Write integration test for `get_errors` with correlation
  - Test `get_errors` response includes `correlation_group` on cross-service events
  - Test `get_errors` with `service` filter still returns correlation annotations
  - Test single-process mode: no `correlation_group` on any events
  - File: `tests/integration/test-correlation-integration.ts`
  - _Requirements: US-6_

**GREEN Phase: Implement to Pass Tests**
- [ ] 10.2 Wire CorrelationEngine into `get_errors` tool handler
  - Modify `get_errors` handler to run correlation on results before returning
  - Use `correlation_window_ms` from config (default: 2000)
  - _Requirements: US-6_

#### Checkpoint: Phase 5 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 6: MCP Tool Extensions

#### Step 11: `list_services` MCP Tool - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 11.1 Write unit tests for `list_services` tool handler
  - Test returns all registered services with correct fields
  - Test single-process mode returns `[{ name: "main", ... }]`
  - Test `error_count` reflects total errors since start
  - Test `last_activity` reflects most recent event timestamp
  - Test service status values match registry state
  - File: `tests/unit/tools/test-list-services.ts`
  - _Requirements: US-5_

**GREEN Phase: Implement to Pass Tests**
- [ ] 11.2 Implement `list_services` MCP tool
  - Register `list_services` tool with MCP server
  - Read from ServiceRegistry, format response
  - Write self-documenting tool description for agent consumption
  - _Requirements: US-5_

#### Step 12: Extend `get_errors` with `service` Filter - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 12.1 Write unit tests for `get_errors` service filter
  - Test `get_errors({ service: "api" })` returns only events from "api"
  - Test `get_errors({})` (no service filter) returns events from all services
  - Test `get_errors({ service: "nonexistent" })` returns empty array
  - Test `service` filter combines with `since`, `source`, and `limit` filters
  - File: `tests/unit/tools/test-get-errors-service-filter.ts`
  - _Requirements: US-4_

**GREEN Phase: Implement to Pass Tests**
- [ ] 12.2 Extend `get_errors` tool handler with `service` parameter
  - Add `service` to tool input schema
  - Filter events by service name when parameter is provided
  - Update tool description to document the new parameter
  - _Requirements: US-4_

#### Checkpoint: Phase 6 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 7: Streamable HTTP Transport

#### Step 13: HTTP Transport - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 13.1 Write unit tests for HTTP transport setup
  - Test HTTP server binds to `127.0.0.1` only
  - Test HTTP server uses configured port (default 9800)
  - Test HTTP server is not created when `--http` is not specified
  - Test HTTP server creation fails gracefully when port is in use
  - File: `tests/unit/transport/test-http-transport.ts`
  - _Requirements: US-7_

**GREEN Phase: Implement to Pass Tests**
- [ ] 13.2 Implement Streamable HTTP transport
  - Create `src/transport/http-transport.ts`
  - Use `@modelcontextprotocol/sdk` Streamable HTTP support
  - Bind to `127.0.0.1:{port}`, share event buffer and registry with stdio transport
  - Only create when `transport.http` is enabled
  - _Requirements: US-7_

**RED Phase: Write Integration Tests**
- [ ] 13.3 Write integration test for HTTP transport
  - Test MCP tool call over HTTP returns same results as stdio
  - Test multiple concurrent HTTP clients receive correct responses
  - File: `tests/integration/test-http-transport.ts`
  - _Requirements: US-7, NFR-7_

**GREEN Phase: Pass Integration Tests**
- [ ] 13.4 Wire HTTP transport into main server initialization
  - Modify `src/index.ts` to conditionally create HTTP transport
  - Ensure graceful shutdown closes HTTP server before child processes
  - _Requirements: US-7_

#### Checkpoint: Phase 7 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 8: Fingerprint Persistence

#### Step 14: Fingerprint Store - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 14.1 Write unit tests for FingerprintStore
  - Test `load()` reads valid JSON file and returns entries
  - Test `load()` with missing file returns empty array
  - Test `load()` with corrupted file logs warning and returns empty array
  - Test `save(entries)` writes valid JSON to `.tracepulse/fingerprints.json`
  - Test `save()` creates `.tracepulse/` directory if it doesn't exist
  - Test `save()` caps entries at 5000, evicting oldest by `last_seen`
  - Test `save()` failure logs warning but does not throw
  - Test file schema includes `version: 1` and `written_at` timestamp
  - Test entries contain only fingerprint, first_seen, last_seen, total_count (no raw messages)
  - File: `tests/unit/persistence/test-fingerprint-store.ts`
  - _Requirements: US-8, NFR-4_

**GREEN Phase: Implement to Pass Tests**
- [ ] 14.2 Implement FingerprintStore
  - Create `src/persistence/fingerprint-store.ts`
  - Implement `load(filePath): PersistedFingerprintEntry[]`
  - Implement `save(filePath, entries): void`
  - Handle missing directory creation, corrupted file recovery, LRU eviction
  - _Requirements: US-8_

#### Step 15: Wire Persistence into Lifecycle - TDD Cycle

**RED Phase: Write Tests First**
- [ ] 15.1 Write integration test for persistence lifecycle
  - Test fingerprints are loaded on startup when `--persist` is enabled
  - Test fingerprints are written on SIGINT shutdown
  - Test fingerprints are NOT loaded/written when `--persist` is not enabled
  - Test loaded fingerprints merge with runtime fingerprints (totals accumulate)
  - File: `tests/integration/test-persistence-lifecycle.ts`
  - _Requirements: US-8_

**GREEN Phase: Implement to Pass Tests**
- [ ] 15.2 Wire FingerprintStore into server lifecycle
  - On startup (if persist enabled): load fingerprints, merge into event buffer's fingerprint index
  - On SIGINT/SIGTERM (if persist enabled): extract fingerprints from buffer, save to disk
  - _Requirements: US-8_

#### Checkpoint: Phase 8 Complete

- [ ] All tests passing
- [ ] No linting errors
- [ ] Type check passes
- [ ] Changelog updated
- [ ] Changes committed

---

### Phase 9: Integration Testing & Backward Compatibility

#### Step 16: Multi-Process Integration Test

- [ ] 16.1 Write integration test for full multi-process flow
  - Spawn TracePulse with a config containing 2 mock services (simple echo scripts)
  - Verify `list_services` returns both services as `running`
  - Trigger an error in one service, verify `get_errors({ service: "..." })` returns it
  - Verify `get_errors({})` returns errors from both services
  - Shut down gracefully, verify all child processes are terminated
  - File: `tests/integration/test-multi-process-flow.ts`
  - _Requirements: US-1, US-4, US-5, NFR-3_

#### Step 17: Backward Compatibility Regression Test

- [ ] 17.1 Write regression test for single-process mode
  - Verify `npx tracepulse start "echo hello"` still works identically to Phase 2
  - Verify `list_services` returns `[{ name: "main", ... }]` in single-process mode
  - Verify `get_errors` without `service` filter works as before
  - Verify `service` field on events defaults to `"main"`
  - File: `tests/integration/test-backward-compat.ts`
  - _Requirements: NFR-5_

#### Step 18: Security Checkpoint

- [ ] 18.1 Verify secret redaction applies to all service sources
  - Test that secrets in multi-process stdout/stderr are redacted before buffer entry
  - Test that secrets in Docker container logs are redacted before buffer entry
  - Test that fingerprint persistence file contains no raw error messages
  - Test that HTTP transport binds to localhost only
  - File: `tests/integration/test-security-phase3.ts`
  - _Requirements: NFR-4_

#### Checkpoint: Phase 9 Complete - Phase 3 Done

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] No linting errors (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Build succeeds (`npm run build`)
- [ ] Security checkpoint passed
- [ ] Single-process backward compatibility verified
- [ ] Changelog updated with Phase 3 entry
- [ ] Changes committed

---

## TDD Reminders

**Before writing ANY implementation code, ask yourself:**
1. Have I written a test for this functionality?
2. Have I seen that test FAIL for the right reason?
3. Am I writing the MINIMAL code to make the test pass?

**If the answer to any of these is NO, STOP and write the test first.**

## Task Status Legend

- `[ ]` = Not started
- `[-]` = In progress
- `[x]` = Completed
