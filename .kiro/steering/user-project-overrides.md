---
inclusion: always
---

# Project Overrides

Project-specific values that override the generic defaults in the managed steering files.
This is the ONLY steering file you should edit. All other steering files are managed by
kiro-rails and will be overwritten on upgrade.

## Tech Stack

- **Runtime**: Node.js 22+ with TypeScript 5.x
- **Project type**: CLI tool + MCP server (no frontend, no backend API)
- **Package format**: npm package, distributable via `npx`
- **Dependencies**: npm with package.json
- **Build**: tsup (esbuild-based bundler for zero-dependency distribution)
- **MCP SDK**: `@modelcontextprotocol/sdk` for MCP server implementation

## Dev Server Ports

- No dev server - this is a CLI tool / MCP server
- MCP transport: stdio (primary), Streamable HTTP on port 9800 (secondary, Phase 3+)
- Internal log collector HTTP server: port 9801 (for future browser integration, Phase 4+)

## Database Engine

- No database - all state is in-memory (ring buffer) during runtime
- Optional file-based persistence for error fingerprint history (JSON files in `.tracepulse/`)

## Project-Specific Rules

- This is an MCP server - stdout is reserved for JSON-RPC protocol messages. All debug/diagnostic output goes to stderr.
- The tool must work with ANY MCP-compatible agent (Kiro, Claude Code, Cursor, Copilot, Cline, Windsurf). No agent-specific code.
- Zero config for basic usage - `npx tracepulse start "npm run dev"` must work without a config file.
- Every RuntimeEvent must include `signal_score` (0-100) and `signal_strength` (high/medium/low) per Decision 7 in the architecture analysis.
- Error parsers are pluggable - each framework parser is a separate module implementing a common interface.
- Secret redaction runs on ALL log output before it enters the ring buffer. No secrets in MCP responses.
- Process spawning must handle graceful shutdown - SIGINT/SIGTERM forwarded to child process.

## Domain Constants

- Event sources: `server-stdout`, `server-stderr`, `build-error`, `docker-log`
- Signal strength tiers: `high` (score >= 50), `medium` (score 20-49), `low` (score < 20)
- Log levels: `error`, `warn`, `info`, `debug`
- Ring buffer max size: 500 events
- Default watch duration: 15 seconds
- Max message length: 500 chars
- Max stack trace frames: 15
- Max raw log line: 1000 chars

## Code Style Overrides

- Use `node:` prefix for all Node.js built-in imports (`node:child_process`, `node:path`, etc.)
- Prefer `interface` over `type` for object shapes
- Use `readonly` on all interface properties that shouldn't be mutated
- Error classes extend a base `TracePulseError` class
- All MCP tool handlers are pure functions that read from the event buffer - no side effects

## Environment and Tooling

- Package manager: npm
- Linter: eslint with `@typescript-eslint`
- Formatter: prettier
- Test runner: vitest
- Build: tsup
- Node.js version: 22+ (for built-in watch mode, structured clone, etc.)
