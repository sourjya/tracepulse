# M7: Agent-Driven Enhancements - Tasks

## M7a: Multi-File Attach + Status Code Filter (v0.7.0)

### Phase 1: HTTP Access Log Parser
- [ ] 1.1 Write tests for HTTP access log parser (uvicorn, express, nginx formats)
- [ ] 1.2 Implement HTTP access log parser with method, path, status, duration extraction
- [ ] 1.3 Register in parser registry (after structlog, before Node.js)
- [ ] 1.4 Add `http_status` to EventContext interface

### Phase 2: Status Code Filter
- [ ] 2.1 Write tests for `status_code_min` filter on ring buffer
- [ ] 2.2 Add `status_code_min` to EventFilters interface
- [ ] 2.3 Implement filter in ring buffer `matches()` function
- [ ] 2.4 Add validation in `validateEventFilters`
- [ ] 2.5 Add `status_code_min` to `get_errors` and `get_server_logs` tool schemas
- [ ] 2.6 Wire through handler functions

### Phase 3: Multi-File Attach
- [ ] 3.1 Write tests for multi-file CLI argument parsing
- [ ] 3.2 Update `parseArgs` to accept multiple `--log-file` flags with `name=path` format
- [ ] 3.3 Write tests for multi-tailer creation and service registration
- [ ] 3.4 Update `main()` to create multiple LogFileTailers when multiple files specified
- [ ] 3.5 Register each file as a service in ServiceRegistry
- [ ] 3.6 Verify backward compat: single `--log-file` still works

### Phase 4: Integration + Verification
- [ ] 4.1 Integration test: multi-file attach with service filtering
- [ ] 4.2 Integration test: status_code_min filter with HTTP access log events
- [ ] 4.3 Full test suite passes
- [ ] 4.4 Typecheck clean
- [ ] 4.5 Build succeeds
- [ ] 4.6 Update changelog
- [ ] 4.7 Bump version to 0.7.0

---

## M7b: Test Runner Integration (v0.7.1)

### Phase 5: Pytest Parser
- [ ] 5.1 Write tests for pytest output parser (FAILED, ERROR, summary line)
- [ ] 5.2 Implement pytest parser
- [ ] 5.3 Register in parser registry

### Phase 6: Jest Parser
- [ ] 6.1 Write tests for Jest output parser (FAIL header, x lines, expect/received)
- [ ] 6.2 Implement Jest parser
- [ ] 6.3 Register in parser registry
- [ ] 6.4 Create `src/parsers/test/index.ts` barrel export

### Phase 7: Test Runner Skill + Verification
- [ ] 7.1 Create `skills/test-runner/SKILL.md`
- [ ] 7.2 Full test suite passes
- [ ] 7.3 Build succeeds
- [ ] 7.4 Update changelog
- [ ] 7.5 Bump version to 0.7.1

---

## M7c: Agent Workflow Skills (v0.7.2)

### Phase 8: Skills
- [ ] 8.1 Create `skills/audit-endpoints/SKILL.md` (CyberAgent pattern for APIs)
- [ ] 8.2 Create `skills/debugger-mode/SKILL.md` (BrowserTools pattern)
- [ ] 8.3 Create `skills/github-issue/SKILL.md` (TracePulse + GitHub MCP)

### Phase 9: last_event_timestamp
- [ ] 9.1 Write test for `last_event_timestamp` in get_errors response
- [ ] 9.2 Add `last_event_timestamp` to get_errors response
- [ ] 9.3 Update SKILL.md "Pro Tips" with cursor pattern using `last_event_timestamp`

### Phase 10: Final Verification
- [ ] 10.1 Full test suite passes
- [ ] 10.2 Build succeeds
- [ ] 10.3 MCP server launch smoke test passes
- [ ] 10.4 Update changelog
- [ ] 10.5 Bump version to 0.7.2
- [ ] 10.6 Update README with new parsers count and skill count
