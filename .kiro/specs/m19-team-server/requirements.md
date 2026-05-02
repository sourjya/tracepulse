# M19: TracePulse Team Server

## Overview

Shared TracePulse instance for engineering teams. Every developer's agent connects via HTTPS to one server that aggregates errors, shares fingerprints, and provides team-level insights.

**Local:** Your agent sees your server.
**Team:** Every agent sees every server. One error found once, shared across the team instantly.

## Architecture

```
Developer A (Kiro)   --+
Developer B (Cursor) --+--> HTTPS --> TracePulse Team Server --> Shared Dev Servers
Developer C (Claude) --+              (EC2/Railway/Docker)       (staging, Docker Compose)
```

## Requirements

### R1: Streamable HTTP Transport (fully wired)
Complete the MCP Streamable HTTP transport so external clients can connect via HTTPS.

### R2: Authentication
API key or SSO-based auth on the HTTP transport. Each developer gets a key. Requests without valid auth are rejected.

### R3: Multi-Tenant Ring Buffer
Per-developer namespaces in the ring buffer. Developer A's errors don't pollute Developer B's get_errors results unless explicitly queried.

### R4: Team-Level Aggregation
- `get_team_errors()` - errors across all developers, deduplicated by fingerprint
- `get_team_audit()` - tool usage across all developers
- `get_team_impact()` - combined token/energy savings for the team

### R5: Cross-Developer Fingerprint Sharing
When Developer A encounters an error, the fingerprint is shared. When Developer B hits the same error, their agent sees "This error was seen by 2 other developers this week."

### R6: Deployment Guide
Docker image + docker-compose.yml for self-hosted deployment. Railway/Fly.io one-click deploy template.

## Effort
- R1: 1 week (transport exists, needs full wiring)
- R2: 1 week (API key auth + middleware)
- R3: 2 weeks (buffer namespacing)
- R4: 1 week (aggregation tools)
- R5: 3 days (fingerprint sharing layer)
- R6: 2 days (Docker + deploy templates)

Total: ~5-6 weeks
