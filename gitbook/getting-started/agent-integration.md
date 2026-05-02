# Agent Integration

TracePulse ships integration configs for major AI coding agents. Copy the relevant file into your project.

## Kiro

TracePulse's [SKILL.md](https://github.com/sourjya/tracepulse/blob/main/skills/tracepulse/SKILL.md) is automatically loaded by Kiro when TracePulse is in your MCP config. No additional setup needed.

For post-edit hooks, copy [`rules/kiro-hooks.json`](https://github.com/sourjya/tracepulse/blob/main/rules/kiro-hooks.json) to `.kiro/hooks/tracepulse.json`.

## Cursor

Copy `rules/tracepulse.cursor-rules` to `.cursor/rules/tracepulse.cursor-rules` in your project.

This teaches Cursor's agent the three-tier verification pattern, key tools, and common pitfalls.

## Claude Code

Add the TracePulse section from `rules/claude-code-integration.md` to your project's `CLAUDE.md`.

## VS Code (Copilot)

Add TracePulse to `.vscode/mcp.json`. Copilot will discover the tools automatically. No rules file needed - Copilot uses tool descriptions directly.

## Windsurf

Add TracePulse to `~/.codeium/windsurf/mcp_config.json`. Windsurf's Cascade reads tool descriptions automatically.

## All Agents

Every agent benefits from TracePulse's tool descriptions and SKILL.md. The integration configs above add agent-specific workflow guidance on top.

| Agent | Config | Workflow Guidance |
|-------|--------|-------------------|
| Kiro | Automatic (SKILL.md) | Hooks for post-edit checks |
| Cursor | `.cursor/rules/` | Three-tier verification |
| Claude Code | `CLAUDE.md` | PostToolUse hooks (when available) |
| VS Code | `.vscode/mcp.json` | Tool descriptions only |
| Windsurf | `mcp_config.json` | Tool descriptions only |
| Cline | `.mcp.json` | Tool descriptions only |
