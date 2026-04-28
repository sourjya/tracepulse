# Agent Skills

TracePulse ships 8 skill files that teach AI agents structured debugging workflows.

## Skills

| Skill | File | What it teaches |
|-------|------|----------------|
| **TracePulse** | `skills/tracepulse/SKILL.md` | All 18 tools, when to use each, pro tips |
| **Backend Error Triage** | `skills/backend-error-triage/SKILL.md` | 7-step debugging workflow |
| **Edit-Verify Loop** | `skills/edit-verify-loop/SKILL.md` | Edit → verify → fix → verify cycle |
| **Full-Stack Debug** | `skills/full-stack-debug/SKILL.md` | TracePulse + Chrome DevTools MCP |
| **Audit Endpoints** | `skills/audit-endpoints/SKILL.md` | CyberAgent-style API audit |
| **Debugger Mode** | `skills/debugger-mode/SKILL.md` | Structured "debug this" workflow |
| **GitHub Issue** | `skills/github-issue/SKILL.md` | Create issue from error |
| **Test Runner** | `skills/test-runner/SKILL.md` | Run tests through TracePulse |

## How Agents Discover Skills

Skills ship with the npm package. MCP clients that support skill discovery will find them automatically. The main `skills/tracepulse/SKILL.md` is the primary entry point.
