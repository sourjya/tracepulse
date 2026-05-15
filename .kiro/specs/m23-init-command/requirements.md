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

## Claude Code: Native Slash Commands (simplest path)

Claude Code auto-discovers files in `.claude/commands/` as slash commands. `tracepulse init` copies skill files there:

```
.claude/commands/
├── tracepulse.md          ← main TP workflow (from skills/tracepulse/SKILL.md)
├── full-stack-debug.md    ← TP + Chrome DevTools combined workflow
├── browser-errors.md      ← browser error capture approaches
├── edit-verify-loop.md    ← edit → verify cycle
└── test-runner.md         ← test runner monitoring
```

Each becomes `/tracepulse`, `/full-stack-debug`, etc. No CLAUDE.md editing needed.

Implementation: ~10 lines - copy from installed `skills/` to `.claude/commands/`.

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
