# M8: Dev Infrastructure Awareness - Tasks

## Phase 1: Crash Loop Detection + Infra Patterns (v0.8.0)

- [ ] 1.1 Write tests for crash loop detector (3+ restarts in 60s = crash loop)
- [ ] 1.2 Implement crash loop detector with sliding window
- [ ] 1.3 Wire into pipeline after hot-reload detector
- [ ] 1.4 Write tests for infrastructure error patterns (connection refused, pool exhausted, OOM, etc.)
- [ ] 1.5 Implement infra pattern scoring rules
- [ ] 1.6 Wire into signal scorer

## Phase 2: Slow Request Alerting (v0.8.0)

- [ ] 2.1 Write tests for duration extraction from uvicorn/express/nginx access logs
- [ ] 2.2 Add duration_ms extraction to HTTP access log parser
- [ ] 2.3 Add SLOW_REQUEST_THRESHOLD_MS constant (default 1000)
- [ ] 2.4 Slow requests get level: "warn" + signal boost

## Phase 3: Migration Parser + Env Validation (v0.8.0)

- [ ] 3.1 Write tests for alembic migration output parser
- [ ] 3.2 Write tests for Django migration output parser
- [ ] 3.3 Implement migration parser
- [ ] 3.4 Register in parser registry
- [ ] 3.5 Write tests for environment validator (.env.example check)
- [ ] 3.6 Implement environment validator
- [ ] 3.7 Wire into startup in cli.ts

## Phase 4: Health Endpoint Probing (v0.8.1)

- [ ] 4.1 Write tests for health prober (HTTP GET, timeout, connection refused)
- [ ] 4.2 Implement health prober with configurable endpoint and interval
- [ ] 4.3 Add --health-url CLI flag
- [ ] 4.4 Surface in get_runtime_status and get_health_summary
- [ ] 4.5 Wire into cli.ts startup/shutdown

## Phase 5: Verification

- [ ] 5.1 Full test suite passes
- [ ] 5.2 MCP server launch smoke test passes
- [ ] 5.3 Build succeeds
- [ ] 5.4 Update changelog
- [ ] 5.5 Update README with new capabilities
- [ ] 5.6 Bump version
