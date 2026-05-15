# M23: `tracepulse init` - Context-Aware Project Setup

## Problem

TracePulse ships skills (SKILL.md, browser-errors/, CLAUDE.md) but only Kiro auto-discovers them. Claude Code, Cursor, and other MCP clients need manual setup. Users don't know which skills apply to their stack or which companion MCPs they have.

## Solution

`tracepulse init` detects the environment and generates the right config + skills for the user's MCP client and project type.

## Behavior

```bash
tracepulse init
```

1. **Detect MCP client** - check for `.kiro/`, `.claude.json`, `.cursor/`, `.vscode/`
2. **Detect companion MCPs** - read the config to find Chrome DevTools MCP, ViewGraph, etc.
3. **Detect project type** - reuse `detectProjectStacks()` (already built)
4. **Generate config** - write the MCP config entry if not already present
5. **Generate skills** - write combined workflow skills based on what's available
6. **Report** - print what was created

## Output by client

| Client | Config written | Skills written |
|--------|---------------|----------------|
| Kiro CLI | `.kiro/settings/mcp.json` | Already auto-discovered from `skills/` |
| Claude Code | `~/.claude.json` (projects section) | `.claude/commands/tracepulse.md` + companions |
| Cursor | `.cursor/mcp.json` | `.cursor/tracepulse-skills.md` |
| Generic | `.mcp.json` | `TRACEPULSE.md` in project root |

## Claude Code: Two-Layer Approach

### Layer 1: CLAUDE.md (always loaded, 20 lines)

`tracepulse init` appends a small block to CLAUDE.md with the critical behavioral rules. This is what makes TP work without user intervention:

```markdown
### TracePulse (auto-injected by `tracepulse init`)
- Use `run_and_watch` instead of Bash for ALL test/build/lint commands
- Use `get_errors` after any backend code change
- Use `verify_fix` after fixing an error
- Never use curl to check server status - use `check_port` or `get_project_health`
- After `start_server`, call `wait_for_build()` before proceeding
- Use `cwd` parameter for cross-project commands (absolute paths allowed)
- Use `max_lines` parameter instead of piping to `head`/`tail`
```

### Layer 2: .claude/commands/ (on-demand, full skills)

Deep workflow guidance available as slash commands:

```
.claude/commands/
├── tracepulse.md          ← main TP workflow (from skills/tracepulse/SKILL.md)
├── full-stack-debug.md    ← TP + Chrome DevTools combined workflow
├── browser-errors.md      ← browser error capture approaches
├── edit-verify-loop.md    ← edit → verify cycle
└── test-runner.md         ← test runner monitoring
```

Each becomes `/tracepulse`, `/full-stack-debug`, etc. Agent invokes when it needs deeper guidance.

### Why two layers?

- CLAUDE.md rules fire automatically every session (zero intervention)
- Slash commands provide depth without bloating every session's context
- 20 lines in CLAUDE.md vs 522 lines of SKILL.md - 96% context savings

## Companion MCP detection

If other MCPs are configured alongside TracePulse, include combined workflows:

| Companion detected | Skills included |
|-------------------|----------------|
| Chrome DevTools MCP | Full-stack debug workflow (6 steps) |
| ViewGraph | Visual regression workflow |
| Both | Complete three-layer stack workflow |
| Neither | Backend-only patterns |

## Tasks

- [ ] 1. Detect MCP client from project files
- [ ] 2. Read existing config to find companion MCPs
- [ ] 3. Generate config entry (idempotent - don't overwrite existing)
- [ ] 4. Generate skills file based on companions + project type
- [ ] 5. Print summary of what was created
- [ ] 6. Add to CLI (parseArgs + handler)
- [ ] 7. Tests for each client detection path
- [ ] 8. Docs: add `tracepulse init` to quick-start and CLI reference

## Future: MCP Resources (M24)

Expose skills as MCP resources so any client can read them programmatically:
```
resources/list → ["tracepulse://skills/main", "tracepulse://skills/browser-errors"]
resources/read("tracepulse://skills/main") → SKILL.md content
```

This is the long-term ideal but requires MCP clients to support resource reading at session start.

## Quick Win: Prescriptive Tool Descriptions (no init needed)

Tool descriptions are the ONLY thing Claude reads automatically when an MCP connects. Current descriptions are neutral ("Run a command..."). Making them prescriptive costs zero and works immediately:

| Tool | Current description | Prescriptive description |
|------|-------------------|------------------------|
| run_and_watch | "Run a command, parse output..." | "Run a command, parse output... Use INSTEAD OF shell for tests, builds, and linters." |
| get_errors | "Get recent error and warning events..." | "Get recent errors. Call this after ANY backend code change." |
| verify_fix | "Post-fix check..." | "Post-fix check. ALWAYS call after fixing an error to confirm it's resolved." |

This is already partially done (run_and_watch says "Use INSTEAD OF shell"). Extend to other key tools.
