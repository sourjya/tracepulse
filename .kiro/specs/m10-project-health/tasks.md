# M10: Project Health & Dependency Awareness - Tasks

## Parsers (make run_and_watch output smarter)

- [ ] 1. npm audit parser - parse "X vulnerabilities (Y critical, Z high)"
- [ ] 2. Coverage parser - parse "Statements: 85%, Branches: 72%, Lines: 88%"
- [ ] 3. npm outdated parser - parse "package  current  wanted  latest"

## Tools

- [ ] 4. check_port(port) - TCP check if port is available
- [ ] 5. get_project_health() - composite: server + infra + errors + build in one call

## Wiring

- [ ] 6. Register parsers in registry
- [ ] 7. Register tools in MCP server
- [ ] 8. Tests
- [ ] 9. Update SKILL.md
