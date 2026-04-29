# Security Log

| Date | Source | Finding | Severity | Resolution |
|------|--------|---------|----------|------------|
| 2026-04-29 | SRR-001 | Command injection via run_and_watch, missing rate limiting, token redaction gaps | HIGH | v0.8.0 - allowlist, rate limiter, Stripe/npm patterns |
| 2026-04-29 | SRR-002 | SSRF on register_probe, shell metacharacters in run_and_watch | HIGH | v0.9.0 - localhost-only probes, metachar rejection, restart cooldown |
| 2026-04-30 | CRR-001 TD-009 | Secret redactor leaks quoted values with spaces (`password = "my secret"` only redacts `"my`) | HIGH | Fixed - regex captures quoted values as a unit |
| 2026-04-30 | CRR-001 TD-017 | Missing GCP, Azure, Datadog credential redaction patterns | MEDIUM | Fixed - 3 new patterns added (16 total) |
| 2026-04-30 | CRR-001 TD-010 | Process spawner reports success for fast-failing commands | MEDIUM | Fixed - any non-zero exit rejects start() |
