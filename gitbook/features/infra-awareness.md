# Infrastructure Awareness

TracePulse detects infrastructure issues from the log stream.

## Crash Loop Detection

If the server restarts 3+ times in 60 seconds, TracePulse injects a crash loop alert with `signal_score: 95`.

## Slow Request Alerting

HTTP requests taking >1000ms are flagged as `[SLOW]` warnings.

## Infrastructure Error Patterns

22 patterns detect:
- **Database:** connection refused, pool exhausted, too many connections
- **Network:** ECONNREFUSED, ETIMEDOUT, ECONNRESET
- **Memory:** MemoryError, heap out of memory, Cannot allocate
- **Disk:** No space left, ENOSPC
- **Redis:** connection errors, WRONGPASS
- **TLS/SSL:** certificate errors
- **DNS:** NXDOMAIN, getaddrinfo ENOTFOUND

## Environment Validation

On startup, TracePulse checks `.env.example` against actual environment variables and warns about missing ones.

## Health Probing

With `--health-url`, TracePulse periodically GETs a health endpoint and reports the result in `get_runtime_status`.
