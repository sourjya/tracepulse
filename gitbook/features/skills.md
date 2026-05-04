# Agent Skills

TracePulse ships 8 skill files that teach AI agents structured debugging workflows. Skills are loaded automatically by MCP clients that support skill discovery.

## Skills

| Skill | File | What it teaches |
|-------|------|----------------|
| **TracePulse** | [`skills/tracepulse/SKILL.md`](https://github.com/sourjya/tracepulse/blob/main/skills/tracepulse/SKILL.md) | All 39 tools, when to use each, query mappings, pro tips |
| **Backend Error Triage** | [`skills/backend-error-triage/SKILL.md`](https://github.com/sourjya/tracepulse/blob/main/skills/backend-error-triage/SKILL.md) | 7-step debugging workflow |
| **Edit-Verify Loop** | [`skills/edit-verify-loop/SKILL.md`](https://github.com/sourjya/tracepulse/blob/main/skills/edit-verify-loop/SKILL.md) | Edit -> verify -> fix -> verify cycle |
| **Full-Stack Debug** | [`skills/full-stack-debug/SKILL.md`](https://github.com/sourjya/tracepulse/blob/main/skills/full-stack-debug/SKILL.md) | TracePulse + Chrome DevTools MCP |
| **Audit Endpoints** | [`skills/audit-endpoints/SKILL.md`](https://github.com/sourjya/tracepulse/blob/main/skills/audit-endpoints/SKILL.md) | Systematic API endpoint audit |
| **Debugger Mode** | [`skills/debugger-mode/SKILL.md`](https://github.com/sourjya/tracepulse/blob/main/skills/debugger-mode/SKILL.md) | Structured "debug this" workflow |
| **GitHub Issue** | [`skills/github-issue/SKILL.md`](https://github.com/sourjya/tracepulse/blob/main/skills/github-issue/SKILL.md) | Create issue from error |
| **Test Runner** | [`skills/test-runner/SKILL.md`](https://github.com/sourjya/tracepulse/blob/main/skills/test-runner/SKILL.md) | Run tests through TracePulse |

## How Agents Discover Skills

Skills ship with the npm package in the `skills/` directory. MCP clients that support skill discovery (like Kiro) load them automatically when TracePulse is in your MCP config. The main [`skills/tracepulse/SKILL.md`](https://github.com/sourjya/tracepulse/blob/main/skills/tracepulse/SKILL.md) is the primary entry point - it covers all 39 tools with workflow patterns, query mappings, and pro tips.

For agents that don't auto-discover skills (Cursor, Claude Code), see the [Agent Integration](../getting-started/agent-integration.md) page for manual setup.
