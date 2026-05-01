# M16: Platform Coverage Expansion - Spec

Source: [Platform Strategy Research](../../docs/research/viewgraph-tracepulse-v1-platform-strategy.md)

## Justification

Python is the #1 growth language (+7pp in Stack Overflow 2025), the dominant language for AI/ML teams (the exact audience using Kiro/Claude Code/Cursor), and FastAPI is the fastest-growing web framework (+5pp). TracePulse's Python parser handles tracebacks but misses Pydantic validation errors - the single most common runtime error in FastAPI apps. Every FastAPI endpoint with a Pydantic model produces these when input is malformed.

Go is TIOBE's fastest-climbing language (11th to 7th in one year), driven by cloud-native adoption. TracePulse has Go panic and go test parsers but doesn't detect `air` hot-reloads - the standard Go dev server equivalent of nodemon.

pnpm and Bun are replacing npm in modern stacks. Turborepo ships pnpm by default. TracePulse's process spawner works with any command, but docs and SKILL.md only mention npm. Users on pnpm/Bun don't know it works.

Monorepo routing is the architectural gap. Turborepo/Nx spawn multiple child processes from one command. TracePulse's multi-process mode exists but requires explicit `--service` flags. Auto-detecting child processes from a single `start` command would cover the most common enterprise topology.

## Requirements

### R1: Pydantic Validation Error Parser
**Priority: HIGH | Effort: Low (1 day)**

FastAPI returns Pydantic validation errors as structured JSON:
```json
{"detail":[{"type":"missing","loc":["body","email"],"msg":"Field required"}]}
```

And logs them as:
```
INFO: 422 Unprocessable Entity
```

The parser should:
- Match Pydantic `ValidationError` in Python tracebacks
- Match FastAPI 422 responses in HTTP access logs
- Extract field name, error type, and message
- Signal score: 30 (validation error, not crash - but actionable)

**Why this matters:** Every FastAPI endpoint with a Pydantic model produces these. AI agents building APIs hit them constantly. Without parsing, the agent sees "422" and has to guess which field failed.

### R2: Go `air` Hot-Reload Detection
**Priority: Medium | Effort: Low (1 hour)**

`air` is Go's standard hot-reload dev server (equivalent of nodemon). Output pattern:
```
watching .
building...
running...
```

Add to hot-reload detector patterns. Currently TracePulse detects 11 frameworks but not `air`.

**Why this matters:** Go developers using `tracepulse start "air"` get `hot_reload_detected: false` even when air reloads. Same trust erosion we saw with uvicorn before we added its patterns.

### R3: pnpm/Bun Documentation
**Priority: Medium | Effort: Low (2 hours)**

TracePulse already works with `pnpm run dev` and `bun run dev` - the process spawner doesn't care about the package manager. But docs and SKILL.md only show npm examples. Users on modern stacks don't know it works.

Update: README, quick-start, SKILL.md, gitbook overview with pnpm/Bun examples.

**Why this matters:** pnpm is the default for Turborepo monorepos. Bun is the default for new greenfield TS projects. Not documenting support = invisible support.

### R4: Spring Boot Error Parser Enhancement
**Priority: Medium | Effort: Low (1 day)**

The Java parser handles standard exceptions. Spring Boot adds:
- `***************************` banner errors (application failed to start)
- `APPLICATION FAILED TO START` with description and action
- Bean creation errors with nested `Caused by:` chains

Add patterns to the existing Java parser.

**Why this matters:** Spring Boot is the enterprise Java default. Angular (18.2% frontend usage) teams almost always pair with Spring Boot. Covering both ends of the enterprise stack is a compelling narrative.

### R5: Monorepo Child-Process Routing
**Priority: HIGH | Effort: Medium (1-2 weeks)**

When `tracepulse start "npx turbo dev"` spawns Turborepo, Turbo spawns N child processes (one per package). TracePulse currently sees all output as one stream. Errors from `packages/api` and `packages/web` are indistinguishable.

Design options:
1. **Parse Turbo's output prefixes** - Turbo prefixes each line with the package name: `api: Error: ...`. Parse the prefix and tag events with the package name.
2. **Auto-detect child processes** - Monitor the process tree for new children and attach separate readers.
3. **Config-based** - Require `--service` flags (current approach, works but manual).

Option 1 is the lowest effort and covers the most common case (Turbo, Nx both prefix output).

**Why this matters:** Enterprise teams run monorepos. Without package-level routing, TracePulse can't tell the agent "the error is in packages/api, not packages/web." The agent wastes tokens investigating the wrong package.

### R6: `uv` Package Manager Awareness
**Priority: Low | Effort: Low (2 hours)**

`uv` is Python's fastest-growing package manager (replacing pip/pipenv in modern stacks). TracePulse should:
- Recognize `uv run` as a valid command prefix in run_and_watch
- Document `tracepulse start "uv run uvicorn main:app"` in Python examples

**Why this matters:** Low effort, signals that TracePulse is current with the Python ecosystem. `uv` users are early adopters - exactly the audience trying AI coding agents.

## Out of Scope (ViewGraph items from the research)
- React fiber component capture
- Vue 3 component boundary capture
- Angular component tree
- @viewgraph/vitest plugin
- Playwright Python fixture
