# Configuration

TracePulse works with zero configuration for single-server projects. A config file is only needed for multi-service setups, custom transport, or persistence options.

## Config file

Create `tracepulse.config.json` in your project root. TracePulse reads it when you pass `--config`:

```bash
tracepulse start --config tracepulse.config.json
```

### Full example

```json
{
  "services": [
    { "name": "api", "command": "npm run dev:api" },
    { "name": "worker", "command": "npm run dev:worker" }
  ],
  "transport": {
    "http": true,
    "http_port": 9800
  },
  "persist": true,
  "correlation_window_ms": 2000
}
```

## Fields

### `services`

An array of services to spawn and monitor. Each service runs as a separate child process with its output tagged by name.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Identifier for this service. Used in `get_errors(service: "api")` to filter. Must be lowercase alphanumeric with hyphens only (`[a-z0-9-]`). |
| `command` | string | Yes | Shell command to spawn. Same as what you'd type in a terminal. |

**Example - API + worker:**
```json
{
  "services": [
    { "name": "api", "command": "uvicorn main:app --reload --port 8000" },
    { "name": "worker", "command": "celery -A tasks worker --loglevel=info" }
  ]
}
```

{% hint style="warning" %}
Service names must be unique. TracePulse rejects configs with duplicate names.
{% endhint %}

### `transport`

Controls how MCP clients connect to TracePulse. By default, TracePulse uses stdio (stdin/stdout) which is what most MCP clients expect.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `http` | boolean | `false` | Enable Streamable HTTP transport alongside stdio. Allows multiple MCP clients to connect simultaneously. |
| `http_port` | number | `9800` | Port for the HTTP transport. Must be 1024-65535. |

**When to enable HTTP:** If you want multiple tools (e.g., Kiro + Cursor) connected to the same TracePulse instance at the same time.

### `persist`

| Type | Default | Description |
|------|---------|-------------|
| boolean | `false` | Save error fingerprints to `.tracepulse/fingerprints.json` on shutdown. |

When enabled, TracePulse loads fingerprints on startup and saves them on shutdown. This powers two tools:

- **`get_new_errors`** - only shows errors with fingerprints not seen in previous sessions
- **`get_error_trends`** - shows cross-session frequency for a fingerprint

Without persistence, every session starts fresh and these tools have no history to compare against.

### `correlation_window_ms`

| Type | Default | Range | Description |
|------|---------|-------|-------------|
| number | `2000` | 100-10000 | Time window (ms) for matching frontend HTTP errors with backend stack traces. |

When a browser reports a failed HTTP request and the backend logs an error within this window, `get_correlated_errors` pairs them together. Increase this if your backend is slow to log; decrease it to reduce false matches.

## Validation rules

TracePulse validates the config on startup and exits with a clear error if anything is wrong:

- Service names: lowercase alphanumeric and hyphens only (`[a-z0-9-]`)
- Service names must be unique within the config
- `http_port`: must be 1024-65535
- `correlation_window_ms`: must be 100-10000
- `services` and `compose` are mutually exclusive (can't use both)

## CLI flags vs config file

Every config file option has a CLI flag equivalent. CLI flags take precedence over the config file.

| Config field | CLI flag | Example |
|-------------|----------|---------|
| `services[].name` + `command` | `--service name="command"` | `--service api="npm run dev"` |
| `transport.http` | `--http` | `--http` |
| `transport.http_port` | `--http-port` | `--http-port 9801` |
| `persist` | `--persist` | `--persist` |

## Minimal configs by use case

**Single service with persistence:**
```json
{ "persist": true }
```
Then run: `tracepulse start --config tracepulse.config.json "npm run dev"`

**Two services:**
```json
{
  "services": [
    { "name": "frontend", "command": "npm run dev" },
    { "name": "backend", "command": "python manage.py runserver" }
  ]
}
```

**HTTP transport for multi-client:**
```json
{
  "transport": { "http": true }
}
```
