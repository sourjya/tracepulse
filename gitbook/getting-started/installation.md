# Installation

## npx (recommended, zero install)

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

No installation needed. The MCP client downloads and runs it on demand.

## Global install

```bash
npm install -g tracepulse
```

Then in your MCP config:
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

## Local development (from source)

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "node",
      "args": ["/path/to/tracepulse/dist/cli.js", "start", "npm run dev"]
    }
  }
}
```

## Modes

### Start mode - spawn and monitor

TracePulse spawns your dev server as a child process:

```json
{ "args": ["tracepulse", "start", "npm run dev"] }
```

### Attach mode - tail existing log

For servers already running (Docker, tmux, pm2, scripts):

```json
{ "args": ["tracepulse", "attach", "--log-file", "./logs/server.log"] }
```

### Multi-file attach - multiple services

```json
{ "args": ["tracepulse", "attach", "--log-file", "backend=./logs/backend.log", "--log-file", "frontend=./logs/frontend.log"] }
```

### Multi-process - spawn multiple services

```json
{ "args": ["tracepulse", "start", "--service", "api=npm run dev:api", "--service", "worker=npm run worker"] }
```

### Docker Compose

```json
{ "args": ["tracepulse", "compose", "--file", "docker-compose.yml"] }
```

## Which mode should I use?

| Situation | Mode |
|-----------|------|
| Simple `npm run dev` or `python manage.py runserver` | **start** |
| Servers managed by scripts, Docker, tmux, pm2 | **attach** |
| Multiple services (API + worker + frontend) | **start --service** or **multi-file attach** |
| Docker Compose setup | **compose** |

## Requirements

- Node.js >= 22.0.0
- Any MCP-compatible AI coding agent
