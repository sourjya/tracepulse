# Infrastructure Awareness

TracePulse doesn't just catch code errors - it detects infrastructure problems from the same log stream. Database down, Redis unreachable, disk full, memory exhausted - these show up as scored events the agent can act on.

## Crash Loop Detection

If your server restarts 3+ times in 60 seconds, something is fundamentally broken. TracePulse detects this pattern and injects a crash loop alert at `signal_score: 95` - the highest priority. The agent sees it immediately in [`get_errors`](../features/mcp-tools.md#get_errors).

## Slow Request Alerting

HTTP requests taking over 1000ms are flagged as `[SLOW]` warnings. The agent can investigate with `get_perf_baseline()` to see if it's a one-off or a pattern.

## 26 Infrastructure Error Patterns

TracePulse recognizes infrastructure errors and boosts their signal score so they surface above regular code errors:

| Category | Patterns | Score Boost |
|----------|----------|-------------|
| **Database** | Connection refused, pool exhausted, too many connections | +20 to +25 |
| **Network** | ECONNREFUSED, ETIMEDOUT, ECONNRESET | +15 to +20 |
| **Memory** | MemoryError, heap out of memory, Cannot allocate | +25 to +30 |
| **Disk** | No space left, ENOSPC | +30 |
| **Redis** | Connection errors, WRONGPASS | +20 |
| **TLS/SSL** | Certificate errors, handshake failures | +15 |
| **DNS** | NXDOMAIN, getaddrinfo ENOTFOUND | +15 |
| **Migration** | Column/table does not exist, pending migrations | +20 |

## Infrastructure Discovery

TracePulse scans your `.env` files for service URLs (`DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_URL`, etc.) and probes their connectivity every 60 seconds. The agent calls [`get_infra_status`](../features/mcp-tools.md#get_infra_status) to see which services are reachable and which are down.

## Environment Validation

On startup, TracePulse compares your `.env` against `.env.example` and warns about missing variables. The agent sees these as low-signal events in the buffer. Use [`check_drift`](../features/mcp-tools.md#check_drift) for a comprehensive drift report.

## Health Probing

With `--health-url http://localhost:8000/health`, TracePulse periodically GETs your health endpoint and reports the result. The agent can also register custom probes via `register_probe()`.

