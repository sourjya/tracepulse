# Security Log

| Date | Source | Finding | Severity | Resolution |
|------|--------|---------|----------|------------|
| 2026-04-29 | SRR-001 | Command injection via run_and_watch, missing rate limiting, token redaction gaps | HIGH | v0.8.0 - allowlist, rate limiter, Stripe/npm patterns |
| 2026-04-29 | SRR-002 | SSRF on register_probe, shell metacharacters in run_and_watch | HIGH | v0.9.0 - localhost-only probes, metachar rejection, restart cooldown |
| 2026-04-30 | CRR-001 TD-009 | Secret redactor leaks quoted values with spaces (`password = "my secret"` only redacts `"my`) | HIGH | Fixed - regex captures quoted values as a unit |
| 2026-04-30 | CRR-001 TD-017 | Missing GCP, Azure, Datadog credential redaction patterns | MEDIUM | Fixed - 3 new patterns added (16 total) |
| 2026-04-30 | CRR-001 TD-010 | Process spawner reports success for fast-failing commands | MEDIUM | Fixed - any non-zero exit rejects start() |
| 2026-04-30 | SRR-003 H-001 | `run_and_watch` allowlist bypass via `bash` prefix enables arbitrary command execution | HIGH | Open |
| 2026-04-30 | SRR-003 H-002 | `run_and_watch` `cwd` parameter allows path traversal to arbitrary directories | HIGH | Open |
| 2026-04-30 | SRR-003 H-003 | Log collector HTTP server missing CORS/Origin restrictions | HIGH | Open |
| 2026-04-30 | SRR-003 M-001 | `register_probe` SSRF bypass via DNS rebinding | MEDIUM | Open |
| 2026-04-30 | SRR-003 M-002 | `health-prober.ts` no localhost restriction on probe URL | MEDIUM | Open |
| 2026-04-30 | SRR-003 M-003 | `process-spawner.ts` inherits full process.env to `run_and_watch` commands | MEDIUM | Open |
| 2026-04-30 | SRR-003 M-004 | Secret redaction missing patterns for newer cloud providers (Supabase, Vault, SendGrid, OPENSSH) | MEDIUM | Open |
| 2026-04-30 | SRR-003 M-005 | `config-scanner.ts` reads .env files without redacting values in memory | MEDIUM | Open |
