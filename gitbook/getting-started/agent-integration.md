# Agent Integration

TracePulse works with any MCP-compatible agent out of the box - the tool descriptions guide the agent automatically. These integration configs add agent-specific workflow guidance on top, teaching each agent the optimal patterns for using TracePulse.

## Kiro

Kiro automatically loads TracePulse's [SKILL.md](https://github.com/sourjya/tracepulse/blob/main/skills/tracepulse/SKILL.md) when TracePulse is in your MCP config. This teaches Kiro the three-tier verification pattern, when to use which tool, and common pitfalls to avoid. No additional setup needed.

**Optional: Post-edit hooks.** Copy [`rules/kiro-hooks.json`](https://github.com/sourjya/tracepulse/blob/main/rules/kiro-hooks.json) to `.kiro/hooks/tracepulse.json` in your project. This reminds Kiro to check for errors after every file edit - so it never forgets to verify its changes.

## Cursor

Copy [`rules/tracepulse.cursor-rules`](https://github.com/sourjya/tracepulse/blob/main/rules/tracepulse.cursor-rules) to `.cursor/rules/tracepulse.cursor-rules` in your project.

This teaches Cursor's agent:
- The three-tier verification pattern (static check -> browser check -> runtime check)
- Which TracePulse tools to use for each situation
- Common mistakes to avoid (don't read terminal manually, don't run psql directly)

## Claude Code

Add the TracePulse section from [`rules/claude-code-integration.md`](https://github.com/sourjya/tracepulse/blob/main/rules/claude-code-integration.md) to your project's `CLAUDE.md`.

This gives Claude Code the same workflow guidance as Kiro and Cursor: use `run_and_watch` instead of shell for tests, use `verify_fix` after changes, start sessions with `get_project_health`.

## VS Code (Copilot)

Add TracePulse to `.vscode/mcp.json`. Copilot discovers the tools automatically from their descriptions. No rules file needed - TracePulse's compressed tool descriptions are designed to guide Copilot to the right tool for each situation.

## Windsurf

Add TracePulse to `~/.codeium/windsurf/mcp_config.json`. Windsurf's Cascade reads tool descriptions automatically and uses them to select the right tool. Same as Copilot - no additional config needed.

## All Agents

Every agent benefits from TracePulse's tool descriptions and SKILL.md. The integration configs above add agent-specific workflow guidance on top - teaching patterns like "always verify after editing" that the tool descriptions alone don't convey.

| Agent | How it learns | Extra config |
|-------|-------------|-------------|
| **Kiro** | SKILL.md (automatic) | Optional hooks for post-edit checks |
| **Cursor** | Rules file | `.cursor/rules/` |
| **Claude Code** | CLAUDE.md | Add section to project CLAUDE.md |
| **VS Code / Copilot** | Tool descriptions | None needed |
| **Windsurf** | Tool descriptions | None needed |
| **Cline** | Tool descriptions | None needed |

> **Tool Reference:** See all [36 MCP Tools](../features/mcp-tools.md) for complete parameter details.
