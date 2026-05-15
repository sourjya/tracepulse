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
| Claude Code | `~/.claude.json` (projects section) | `CLAUDE.md` appended with TP skills |
| Cursor | `.cursor/mcp.json` | `.cursor/tracepulse-skills.md` |
| Generic | `.mcp.json` | `TRACEPULSE.md` in project root |

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
