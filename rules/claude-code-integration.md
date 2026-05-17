# TracePulse Integration for Claude Code

## CLAUDE.md Addition

Add this to your project's CLAUDE.md to teach Claude Code about TracePulse:

```markdown
## Runtime Feedback (TracePulse)

TracePulse MCP tools are available for backend runtime feedback. Prefer them over reading terminal output.

### After every code change
1. `get_build_errors()` - instant build check
2. `verify_fix(duration_seconds: 3)` - runtime pass/fail

### When debugging
1. `get_project_health()` - full status in one call
2. `get_errors(limit: 5)` - errors ranked by signal_score
3. `get_error_context(fingerprint)` - deep dive with fix suggestions

### Running tests
Use `run_and_watch` instead of shell - structured output, WSL-reliable:
- `run_and_watch("pytest tests/", cwd: "./backend")`
- `run_and_watch("npx vitest run", cwd: "./frontend")`

### When stuck (2+ failed attempts)
- `get_cross_layer_diagnosis()` - correlates backend, frontend, git, and process signals
- `correlate_with_diff()` - links errors to your recent uncommitted changes

### After changing MCP server code
- `verify_mcp(command)` - confirm the server starts and responds to initialize

### Avoid
- Don't read terminal manually - use TracePulse
- Don't run psql/mysql directly - they hang on password prompts
- Don't prefix run_and_watch with cd - use cwd parameter

### NEVER (explicit prohibitions)
- `nohup cmd &` → use `start_server(command, cwd?, env?)`
- `uvicorn`/`npm run dev`/`python manage.py runserver` in shell → use `start_server`
- `pytest`/`vitest`/`tsc` in shell → use `run_and_watch`
- `curl localhost:PORT` → use `check_port` or `get_project_health`
- Background processes with `&` → use `start_server`
```

## Hooks (PostToolUse)

When Claude Code supports PostToolUse hooks, add to `.claude/hooks.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool_name": "write_file" },
        "command": "echo 'Check: get_build_errors() after file change'"
      }
    ]
  }
}
```

This reminds the agent to check for errors after every file write. Full hook automation (auto-calling get_build_errors) requires Claude Code's hook system to support MCP tool invocation, which is not yet available.
