# Testing Coverage Assessment

## Current state (2026-05-04)

### Automated - Unit Tests (953 tests, 108 files)
| Area | Tests | Coverage |
|------|-------|----------|
| 25 error parsers | ~200 | Golden file fixtures + unit tests |
| 39 MCP tool handlers | ~150 | Each handler tested in isolation |
| Pipeline (scoring, redaction, normalization) | ~100 | Signal scoring, secret patterns, ANSI stripping |
| Clustering / gateway proxy | 14 | Flat mode, clustered mode, discovery, dispatch, destructive guard |
| Bug pattern detection | 27 | 6 pattern types, cost calculator, injector |
| Startup diagnostics | 7 | Shell syntax, missing deps, port conflicts |
| Project detection | 14 | 7 stack types, monorepos, start suggestions |
| CLI argument parsing | 11 | All modes, persistence default, zero-config |
| Startup regressions (BUG-017/018/019) | 8 | isConnected, bin wrapper, package.json files |
| Compact fields, semantic grouping, diff cache | 11 | Token optimization features |

### Automated - Installation Tests (15 scenarios)
| Scenario | Status |
|----------|--------|
| Version check | ✓ |
| Node.js project detection | ✓ |
| Python project detection | ✓ |
| Python with start script suggestions | ✓ |
| Go project detection | ✓ |
| Rust project detection | ✓ |
| Empty directory (standalone) | ✓ |
| Monorepo (multi-stack) | ✓ |
| Shell syntax diagnostic | ✓ |
| Start mode with real command | ✓ |

### NOT Tested - Gaps

#### Priority 1: Critical user journeys
| Gap | Risk | Effort |
|-----|------|--------|
| **Full MCP tool call round-trip** (init -> call tool -> get result) | Agent can't use tools if handshake works but tool calls fail | 1 day |
| **Server lifecycle** (start -> errors flow -> verify_fix -> stop) | Core value prop untested end-to-end | 1 day |
| **Persistence across sessions** (save -> restart -> load -> get_new_errors) | Cross-session features may silently break | 0.5 day |
| **Uninstall** (npm uninstall -g tracepulse) | Leftover files, broken PATH | 0.5 hour |

#### Priority 2: Mode coverage
| Gap | Risk | Effort |
|-----|------|--------|
| **Attach mode with real log file** | Second most common mode, untested E2E | 0.5 day |
| **Multi-service mode** (--service flag) | Enterprise use case | 0.5 day |
| **Docker Compose mode** | Requires Docker, harder to automate | 1 day |
| **Upgrade path** (old version -> new version) | Config format changes could break | 0.5 hour |

#### Priority 3: Platform coverage
| Gap | Risk | Effort |
|-----|------|--------|
| **macOS** | readlink -f doesn't exist, uses realpath fallback | Manual test |
| **Windows** | .cmd wrapper untested | Manual test or CI |
| **WSL** | Most common Windows dev environment | Manual test |

## Recommended test plan

### Phase 1: Expand install test script (this week)
Add to `scripts/test-install.sh`:
- Full tool call round-trip (call get_project_health, verify JSON response)
- Uninstall + reinstall cycle
- Persistence: run once, check .tracepulse/ created, run again, verify history loaded
- Attach mode with a temp log file
- Upgrade: install old version, upgrade, verify

### Phase 2: Integration test suite (next week)
New `scripts/test-integration.sh`:
- Start a real Python HTTP server via TracePulse
- Trigger an error (hit a bad endpoint)
- Call get_errors, verify the error appears
- Call verify_fix after fixing
- Call get_bug_patterns after multiple sessions
- Multi-service: start two servers, verify service tagging

### Phase 3: CI pipeline (future)
- GitHub Actions matrix: Ubuntu, macOS, Windows
- Run install tests on each platform
- Run integration tests on Ubuntu
- Publish only if all tests pass
