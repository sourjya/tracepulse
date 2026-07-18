# Claude Code

TracePulse has first-class support for [Claude Code](https://claude.com/claude-code). One command wires up everything: the MCP server, agent workflow rules, a `/tracepulse` slash command, and a guardrail that keeps the agent using TracePulse instead of shelling out.

## Setup in one command

From your project root:

```bash
tracepulse init --claude
```

That installs four things:

| What | Where | Purpose |
|------|-------|---------|
| **MCP server** | project-root `.mcp.json` | Registers the `tracepulse` server so Claude Code can call its tools. |
| **Workflow rules** | `~/.claude/rules/tracepulse.md` | Auto-loaded every session (Claude Code reads `~/.claude/rules/*.md` natively). Teaches the agent the TracePulse patterns — health-check first, `run_and_watch` over shell, event-driven waiting. |
| **`/tracepulse` command** | `.claude/commands/tracepulse.md` | An on-demand slash command with the full tool cheat-sheet. |
| **Friction gate** | `.claude/hooks/tracepulse-gate.sh` + a `PreToolUse` entry in `.claude/settings.json` | Blocks shelled test/build/lint runners so the agent uses TracePulse's structured tools. |

It also adds `.tracepulse/` to your `.gitignore` (session data — never commit it).

> **Restart Claude Code after running init.** MCP servers attach only at startup — a running session won't pick up the new server until you restart it.

## Verify it worked

In Claude Code, run:

```
/mcp
```

You should see the `tracepulse` server listed. Project-scoped servers from `.mcp.json` require a one-time trust approval the first time — approve it, and the TracePulse tools become available.

Then confirm the tools respond:

```
Ask Claude: "call get_project_health"
```

## The friction gate — why shell test/build/lint gets blocked

After `init --claude`, if the agent tries to run a test, build, or lint command through **Bash** (e.g. `npx vitest run`, `npm run build`, `eslint .`, `pytest`), the `PreToolUse` hook **denies it** and points the agent at the TracePulse equivalent:

- `run_and_watch("<command>")` — runs tests/builds/lints and returns structured pass/fail with parsed, fingerprinted errors.
- `verify_build` — typecheck + build + runtime error check in one call.

This is deliberate. Prose instructions ("please use TracePulse") are easy for an agent to skip; a hook is deterministic. The gate is what makes the agent actually reach for the structured tools instead of parsing raw terminal text. See [The Friction Gradient Discovery](https://github.com/sourjya/tracepulse/blob/main/docs/how-we-improve.md) for the story behind it.

**Emergency bypass.** For a genuine one-off where you must shell a runner directly:

```bash
TRACEPULSE_GATE_BYPASS=1 npx vitest run
```

The gate requires [`jq`](https://jqlang.github.io/jq/) to read the command. If `jq` isn't installed, the gate fails open (allows the command) rather than blocking your work.

## Manual setup (without init)

If you prefer to wire it by hand, or `init` isn't available, add the MCP server yourself. Claude Code reads project MCP servers from the **project-root `.mcp.json`** (committable, team-shared) or per-user **`~/.claude.json`** (local, private) — **not** from `.claude/mcp.json`.

**Project scope** — `<project>/.mcp.json`:

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse"
    }
  }
}
```

**Local scope** — `~/.claude.json`, keyed by project path:

```json
{
  "projects": {
    "/absolute/path/to/your/project": {
      "mcpServers": {
        "tracepulse": { "command": "tracepulse" }
      }
    }
  }
}
```

To also monitor your dev server live, use `"args": ["start", "npm run dev"]` (replace with your server command). See [MCP Client Setup](mcp-client-setup.md) for the full config reference.

> MCP servers do **not** go in `.claude/settings.json` (that's the permissions/hooks file) or `~/.claude/settings.json` (user preferences). Run `/mcp` to confirm which file Claude Code actually read.

## Keeping it up to date

Re-run `tracepulse init --claude` after upgrading TracePulse to sync the latest rules, command, and gate. The command is idempotent — it won't duplicate the hook registration or clobber other servers in your `.mcp.json`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `/mcp` doesn't list `tracepulse` | You edited the wrong file. It must be project-root `.mcp.json` or `~/.claude.json`, not `.claude/mcp.json`. Restart Claude Code after any change. |
| Server listed as "pending approval" | Project `.mcp.json` needs a one-time trust approval — approve it in the `/mcp` view. |
| Shelled tests run without being blocked | The gate isn't registered. Re-run `tracepulse init --claude` and confirm `.claude/settings.json` has a `hooks.PreToolUse` entry referencing `tracepulse-gate.sh`. |
| Every Bash command errors about `jq` | Install `jq`, or the gate can't parse commands. (It fails open, so this is a warning, not a block.) |

## See also

- [MCP Client Setup](mcp-client-setup.md) — config for every editor.
- [Agent Integration](agent-integration.md) — workflow guidance per agent.
- [Why `run_and_watch` instead of shell](../features/mcp-tools.md) — the structured-output rationale.
