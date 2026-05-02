# Quick Start

Get TracePulse running in 2 minutes.

## 1. Add to your MCP config

Find your MCP client's config file:

| Client | Config File |
|--------|-------------|
| **Kiro CLI** | `.kiro/settings/mcp.json` (in your project) |
| **Claude Desktop (macOS)** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Claude Desktop (Windows)** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Cursor** | `.cursor/mcp.json` (in your project) |
| **VS Code (Copilot)** | `.vscode/mcp.json` (in your project) |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Generic** | `.mcp.json` (in your project root) |

Add TracePulse:

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "npx",
      "args": ["tracepulse", "start", "npm run dev"]
    }
  }
}
```

Replace `npm run dev` with your dev server command (`python manage.py runserver`, `go run main.go`, etc.).

> **Tip:** Not sure which config file to edit? Just paste the JSON above into your agent's chat and ask: "Add TracePulse to my MCP config." The agent knows where its own config file is and can add it for you.

### Examples by language

**Python (Django/FastAPI/Flask):**
```json
{ "args": ["tracepulse", "start", "python manage.py runserver"] }
{ "args": ["tracepulse", "start", "uvicorn main:app --reload"] }
{ "args": ["tracepulse", "start", "flask run --reload"] }
```

**Go:**
```json
{ "args": ["tracepulse", "start", "go run main.go"] }
```

**Java (Spring Boot / Gradle):**
```json
{ "args": ["tracepulse", "start", "mvn spring-boot:run"] }
{ "args": ["tracepulse", "start", "./gradlew bootRun"] }
```

**Rust:**
```json
{ "args": ["tracepulse", "start", "cargo run"] }
```

**pnpm / Bun (modern Node.js):**
```json
{ "args": ["tracepulse", "start", "pnpm run dev"] }
{ "args": ["tracepulse", "start", "bun run dev"] }
```

TracePulse works with any package manager - npm, pnpm, Bun, yarn. The process spawner doesn't care which one starts the server.

### Prerequisites

TracePulse is a Node.js tool. It requires **Node.js 22+** installed, but your project does not need to be Node.js. TracePulse runs alongside any dev server - Python, Go, Java, Rust, or anything that prints to stdout/stderr.

**For non-Node projects (Python, Go, Java, Rust):** Install TracePulse globally once:
```bash
npm install -g tracepulse
```
Then use `"command": "tracepulse"` (not `"command": "npx"`):
```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse",
      "args": ["start", "python manage.py runserver"]
    }
  }
}
```

**For Node.js projects:** `npx` works without global install:
```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "npx",
      "args": ["tracepulse", "start", "npm run dev"]
    }
  }
}
```

If you don't have Node.js: [Install Node.js](https://nodejs.org/) (LTS recommended).

## 2. Attach mode (servers already running)

If your servers are managed by Docker, tmux, pm2, or scripts:

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "npx",
      "args": ["tracepulse", "attach", "--log-file", "./logs/server.log"]
    }
  }
}
```

## 2b. Standalone mode (fresh projects, libraries, no server yet)

For projects without a dev server or log file - libraries, monorepos, CLI tools, fresh projects. You still get `run_and_watch`, `verify_build`, `check_port`, `get_migration_status`, and all other tools:

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "npx",
      "args": ["tracepulse", "standalone"]
    }
  }
}
```

**Real-world validation:** A TypeScript library monorepo used TracePulse in standalone mode for 11 hours with 70+ tool calls. `run_and_watch` replaced all shell commands for tests and type-checking, catching unused imports, type errors, and test failures with structured output. No dev server needed.

Upgrade to `start` mode later when you add a dev server. No config change needed beyond swapping `standalone` for `start "your command"`.

> **Note (v0.9.5+):** If you use `start` mode but the command fails (e.g., no `dev` script), TracePulse automatically falls back to standalone mode instead of crashing. You still get all tools.

## 3. Start a chat

Open your AI coding agent and start working. TracePulse connects automatically.

Try asking:

```
Are there any backend errors?
```

The agent calls `get_errors()` and tells you what's wrong - with file, line number, error type, and importance score.

Or let the agent check everything at once:

```
Check the project health.
```

The agent calls `get_project_health()` - server status, infrastructure connectivity, error count, and build status in one call.

## 4. Let the agent verify its own fixes

After the agent makes a code change, it can verify the fix worked:

```
Verify the fix is clean.
```

The agent calls `verify_fix()` - watches for new errors, checks the build, and returns a definitive pass/fail. No more "I think I fixed it."

## That's it

The agent now has 30 tools for backend debugging. It uses them automatically when investigating errors, verifying fixes, running tests, and monitoring your dev server.

## Common Commands to Try

| Ask the agent | What happens |
|---------------|-------------|
| "Any backend errors?" | `get_errors()` - errors ranked by importance |
| "Check project health" | `get_project_health()` - server + infra + errors in one call |
| "Run the tests" | `run_and_watch("pytest tests/")` - structured pass/fail results |
| "Verify the fix" | `verify_fix()` - definitive pass/fail after a code change |
| "What's the build status?" | `get_build_errors()` - TypeScript, ESLint, Vite/webpack errors |
| "Check migration status" | `get_migration_status()` - pending migrations across frameworks |

You don't need to remember tool names. Describe what you want and the agent picks the right tool.

## Next Steps

- [Installation options ->](installation.md)
- [All 30 MCP tools ->](../features/mcp-tools.md)
- [TracePulse in Action (real examples) ->](../tutorials/tracepulse-in-action.md)
- [Why TracePulse? ->](../why-tracepulse.md)

## Troubleshooting

### "connection closed: initialize response"

TracePulse started but crashed before completing the MCP handshake. Common causes:

1. **Kiro IDE can't find tracepulse** - the IDE's PATH differs from your terminal. Find the absolute path with `which tracepulse` and use it directly: `"command": "/full/path/to/tracepulse"`
2. **Dev server command doesn't exist** - check that the command in `args` works when you run it manually in the terminal
3. **No Node.js installed** - `npx` requires Node.js. Install it from [nodejs.org](https://nodejs.org/) or use a global install
4. **Old version** - standalone mode requires v0.9.3+. Update: `npm install -g tracepulse@latest`
5. **No package.json** - if using `npm run dev`, the project needs a `package.json` with a `dev` script. For non-Node projects, use the actual server command directly

### "tracepulse: command not found"

Install globally: `npm install -g tracepulse`. If it still fails, use the absolute path from `which tracepulse`.

### Tools don't appear in the agent

Check you're editing the right config file. Kiro CLI uses `.kiro/settings/mcp.json` (not `.kiro/mcp.json`). Restart the agent after editing the config.

For the full installation matrix with all edge cases, see [Installation Matrix](../../docs/engineering/installation-matrix.md).
