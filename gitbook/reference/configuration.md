# Configuration

## Config File

`tracepulse.config.json` in project root:

```json
{
  "services": [
    { "name": "api", "command": "npm run dev:api" },
    { "name": "worker", "command": "npm run dev:worker" }
  ],
  "transport": { "http": true, "http_port": 9800 },
  "persist": true,
  "correlation_window_ms": 2000
}
```

## Validation Rules

- Service names: `[a-z0-9-]` only, must be unique
- `correlation_window_ms`: 100-10000
- `transport.http_port`: 1024-65535
- `services` and `compose` are mutually exclusive
