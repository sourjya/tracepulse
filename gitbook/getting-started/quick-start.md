# Quick Start

Get TracePulse running in 2 minutes. Works with any project - Node, Python, Go, Rust, Java, or anything else.

## Step 1: Install TracePulse

You need [Node.js 22+](https://nodejs.org/) installed (even if your project isn't Node.js).

```bash
npm install -g tracepulse
tracepulse init
```

`tracepulse init` auto-detects your AI tool and:
- Merges TracePulse into your existing MCP config (preserves other servers)
- Installs steering files, hooks, and prompt shortcuts (`@tp-debug`, `@tp-health`, `@tp-test`, `@tp-diagnose`, `@tp-start`)
- Adds `.tracepulse/` to your .gitignore
- Checks for updates against the npm registry

Verify it worked:
```bash
tracepulse --version
```

## Step 2: Tell your AI tool about TracePulse

Find the config file for your AI tool and add TracePulse:

| AI Tool | Config File |
|---------|-------------|
| **Kiro CLI** | `.kiro/settings/mcp.json` in your project |
| **Claude Code** | `~/.claude.json` under `projects["/path"].mcpServers` |
| **Cursor** | `.cursor/mcp.json` in your project |
| **Claude Desktop** | See [MCP Client Setup](mcp-client-setup.md) for path |
| **VS Code (Copilot)** | `.vscode/mcp.json` in your project |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |

Paste this into the config file:

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse"
    }
  }
}
```

That's the entire setup. TracePulse figures out the rest automatically.

{% hint style="success" %}
**Not sure which file to edit?** Paste the JSON above into your agent's chat and ask: "Add TracePulse to my MCP config." The agent knows where its own config lives.
{% endhint %}

## Step 3: Restart your AI tool

Close and reopen your AI tool (or restart the session). TracePulse should now appear as connected.

In Kiro CLI, type `/mcp list` to verify - you should see `tracepulse ● running 42 tools`.

## Step 4: Try it out

Open a chat and ask:

| You say | What happens |
|---------|-------------|
| "Check project health" | Full status report: server, errors, infrastructure |
| "Any backend errors?" | Errors ranked by importance with file and line number |
| "Run the tests" | Structured pass/fail results (not raw terminal output) |
| "Verify the fix" | Watches for new errors after your code change, returns pass/fail |

You don't need to remember tool names. Just describe what you want.

## Optional: Monitor your dev server

The basic setup gives you 42 tools for running commands, checking ports, detecting drift, and more. To also get **live error monitoring** (errors caught the moment they happen), tell TracePulse about your dev server.

Add your server command to the config:

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "tracepulse",
      "args": ["start", "npm run dev"]
    }
  }
}
```

Replace `npm run dev` with whatever you type in your terminal to start your server:

| Your project | Command |
|-------------|---------|
| Node.js | `npm run dev` or `pnpm run dev` |
| Python (Django) | `python manage.py runserver` |
| Python (FastAPI) | `uvicorn main:app --reload` |
| Go | `go run main.go` |
| Rust | `cargo run` |
| Java (Spring) | `mvn spring-boot:run` |
| Shell script | `bash scripts/start.sh` |

{% hint style="info" %}
**Don't know your server command yet?** Skip this step. The agent can start the server later by calling `start_server()` - TracePulse will suggest the right command based on your project files.
{% endhint %}

{% hint style="warning" %}
**If your server needs environment variables** (like `PYTHONPATH`), put them in the `env` field - not in the command itself.

Won't work: `"args": ["start", "PYTHONPATH=src python app.py"]`

Works:
```json
{
  "args": ["start", "python app.py"],
  "env": { "PYTHONPATH": "src" }
}
```
{% endhint %}

## Next steps

- [Installation options](installation.md) - attach mode, multi-service, Docker Compose
- [All 42 MCP tools](../features/mcp-tools.md) - what TracePulse can do
- [TracePulse in Action](../tutorials/tracepulse-in-action.md) - real-world examples
- [Troubleshooting](installation.md#troubleshooting) - if something isn't working
