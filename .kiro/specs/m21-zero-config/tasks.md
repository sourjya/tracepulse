# M21 Tasks

## Phase 1: Zero-Config Default (2-3 days)

### 1.1 Make bare `tracepulse` start Layer 0+1
- [ ] 1. RED: Test that `parseArgs(["node", "cli.js"])` returns standalone (not null)
- [ ] 2. GREEN: Change parseArgs to default to standalone when no subcommand given
- [ ] 3. RED: Test that Layer 0 tools work without a server
- [ ] 4. GREEN: Verify all Layer 0 tools return meaningful results with no collector

### 1.2 Project detection on startup
- [ ] 5. RED: Tests for detectProjectStacks() - finds package.json, pyproject.toml, go.mod, etc.
- [ ] 6. GREEN: Implement detectProjectStacks() in src/diagnostics/project-detector.ts
- [ ] 7. RED: Tests for suggestStartCommands() - reads package.json scripts, pyproject.toml, Makefile
- [ ] 8. GREEN: Implement suggestStartCommands()
- [ ] 9. Wire detection into startup - log detected stacks, set parser priorities

### 1.3 start_server tool
- [ ] 10. RED: Tests for start_server handler - validates command, spawns process, returns status
- [ ] 11. GREEN: Implement handleStartServer in src/tools/start-server.ts
- [ ] 12. RED: Tests for pre-spawn diagnostics (shell syntax, missing commands)
- [ ] 13. GREEN: Wire startup-diagnostics into start_server validation
- [ ] 14. RED: Tests for "already running" guard
- [ ] 15. GREEN: Implement server state tracking
- [ ] 16. Register start_server + stop_server in server.ts

### 1.4 Layer-aware get_project_health
- [ ] 17. RED: Tests for layer-aware response (no server vs server running)
- [ ] 18. GREEN: Update get_project_health with layers, suggestions, tools_available count
- [ ] 19. RED: Tests for start command suggestions from detected project files
- [ ] 20. GREEN: Wire suggestStartCommands into get_project_health

### 1.5 Backward compatibility
- [ ] 21. Test: `tracepulse start "npm run dev"` still works exactly as before
- [ ] 22. Test: `tracepulse attach --log-file x` still works
- [ ] 23. Test: `tracepulse standalone` still works
- [ ] 24. Test: `tracepulse compose` still works

## Phase 2: Smart Detection (1 week)

### 2.1 Start command hints
- [ ] 25. RED: Tests for package.json scripts.dev detection
- [ ] 26. RED: Tests for pyproject.toml uvicorn/gunicorn detection
- [ ] 27. RED: Tests for Makefile dev target detection
- [ ] 28. RED: Tests for scripts/*.sh detection
- [ ] 29. GREEN: Implement all hint detectors
- [ ] 30. Wire hints into get_project_health suggestions

### 2.2 Stack-aware allowlist
- [ ] 31. RED: Tests for dynamic allowlist expansion based on detected stack
- [ ] 32. GREEN: Expand run_and_watch allowlist when Python/Go/Java/Rust detected

### 2.3 Pre-spawn validation
- [ ] 33. RED: Tests for command validation before spawning (diagnostics run first)
- [ ] 34. GREEN: start_server runs diagnostics and returns findings before attempting spawn

## Phase 3: Dynamic Tool Registration (1 week)

- [ ] 35. Design: tool activation/deactivation via MCP tools/list_changed
- [ ] 36. RED: Tests for Layer 2 tools returning "not available" before start_server
- [ ] 37. GREEN: Implement conditional tool responses based on active layers
- [ ] 38. RED: Tests for tools/list_changed notification after start_server
- [ ] 39. GREEN: Emit notification when layer activates

## Phase 4: Documentation
- [ ] 40. Update README with zero-config as primary install path
- [ ] 41. Update quick-start: simplest possible config first
- [ ] 42. Update SKILL.md with start_server workflow
- [ ] 43. Create gitbook page: features/zero-config.md
- [ ] 44. Update schema reduction SVG with layer counts
