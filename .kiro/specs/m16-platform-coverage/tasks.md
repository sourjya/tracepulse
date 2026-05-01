# M16 Tasks

## Phase 1: Quick Wins (2-3 days)

- [ ] 1. Build Pydantic validation error parser (`src/parsers/pydantic-parser.ts`)
- [ ] 2. Register Pydantic parser in parser-registry.ts
- [ ] 3. Tests for Pydantic parser (ValidationError traceback + 422 access log)
- [ ] 4. Add `air` hot-reload pattern to hot-reload detector
- [ ] 5. Test `air` pattern detection
- [ ] 6. Add `uv run` to run_and_watch command allowlist
- [ ] 7. Update docs: pnpm/Bun/uv examples in README, quick-start, SKILL.md

## Phase 2: Spring Boot Enhancement (1 day)

- [ ] 8. Add Spring Boot banner error patterns to Java parser
- [ ] 9. Add APPLICATION FAILED TO START pattern
- [ ] 10. Tests for Spring Boot patterns
- [ ] 11. Update gitbook parsers page with Spring Boot examples

## Phase 3: Monorepo Routing (1-2 weeks)

- [ ] 12. Design: parse Turbo/Nx output prefixes for package-level tagging
- [ ] 13. Implement prefix-based service tagging in process spawner
- [ ] 14. Wire tagged events into service registry
- [ ] 15. Tests for monorepo prefix parsing
- [ ] 16. Update SKILL.md with monorepo workflow examples
- [ ] 17. Update gitbook with monorepo setup guide

## Phase 4: Verification

- [ ] 18. Full test suite + typecheck + build
- [ ] 19. Update parser count in all docs
- [ ] 20. Update changelog
