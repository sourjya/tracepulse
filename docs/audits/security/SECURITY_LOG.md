# Security Log

| Date | Source | Finding | Severity | Resolution |
|------|--------|---------|----------|------------|
| 2026-04-29 | SRR-001 | Command injection via run_and_watch, missing rate limiting, token redaction gaps | HIGH | v0.8.0 - allowlist, rate limiter, Stripe/npm patterns |
| 2026-04-29 | SRR-002 | SSRF on register_probe, shell metacharacters in run_and_watch | HIGH | v0.9.0 - localhost-only probes, metachar rejection, restart cooldown |
| 2026-04-30 | CRR-001 TD-009 | Secret redactor leaks quoted values with spaces (`password = "my secret"` only redacts `"my`) | HIGH | Fixed - regex captures quoted values as a unit |
| 2026-04-30 | CRR-001 TD-017 | Missing GCP, Azure, Datadog credential redaction patterns | MEDIUM | Fixed - 3 new patterns added (16 total) |
| 2026-04-30 | CRR-001 TD-010 | Process spawner reports success for fast-failing commands | MEDIUM | Fixed - any non-zero exit rejects start() |
| 2026-04-30 | SRR-003 H-001 | `run_and_watch` allowlist bypass via `bash` prefix enables arbitrary command execution | HIGH | Open |
| 2026-04-30 | SRR-003 H-002 | `run_and_watch` `cwd` parameter allows path traversal to arbitrary directories | HIGH | Fixed - `resolvePath` + `startsWith` check |
| 2026-04-30 | SRR-003 H-003 | Log collector HTTP server missing CORS/Origin restrictions | HIGH | Partial - origin check added but bypassable (see SRR-004 H-005) |
| 2026-04-30 | SRR-003 M-001 | `register_probe` SSRF bypass via DNS rebinding | MEDIUM | Open |
| 2026-04-30 | SRR-003 M-002 | `health-prober.ts` no localhost restriction on probe URL | MEDIUM | Open |
| 2026-04-30 | SRR-003 M-003 | `process-spawner.ts` inherits full process.env to `run_and_watch` commands | MEDIUM | Open |
| 2026-04-30 | SRR-003 M-004 | Secret redaction missing patterns for newer cloud providers (Supabase, Vault, SendGrid, OPENSSH) | MEDIUM | Open |
| 2026-04-30 | SRR-003 M-005 | `config-scanner.ts` reads .env files without redacting values in memory | MEDIUM | Open |
| 2026-05-01 | SRR-004 H-004 | `verify_build` accepts arbitrary commands via `typecheck_command`/`build_command` params — `npx evil-pkg` passes allowlist | HIGH | Open |
| 2026-05-01 | SRR-004 H-005 | Log collector origin check bypass via subdomain (`localhost.evil.com`) and missing Origin header | HIGH | Open |
| 2026-05-01 | SRR-004 M-006 | `verify_build` amplifies H-001 allowlist bypass — two injection points instead of one | MEDIUM | Open |
| 2026-05-01 | SRR-004 M-007 | `diagnoseFailure` leaks filesystem structure (`.venv`, `pyproject.toml` existence) in MCP responses | MEDIUM | Open |
| 2026-05-01 | SRR-004 M-008 | `.venv/bin/python` allowlist entry enables arbitrary script execution (`.venv/bin/python /tmp/evil.py`) | MEDIUM | Open |
| 2026-05-01 | SRR-004 M-009 | Pydantic parser `TYPE_ERROR` regex `.*\[type=` moderate backtracking risk on long lines | MEDIUM | Open |
| 2026-05-01 | SRR-004 L-001 | Frontend crash bridge accepts arbitrary message content (mitigated by JSON-only pipeline) | LOW | Accepted |
| 2026-05-01 | SRR-004 L-002 | Score decay/error lifecycle not externally manipulable (informational) | LOW | Accepted |
| 2026-05-01 | SRR-004 L-003 | Standalone mode `isConnected()` always true — UX issue, not security | LOW | Accepted |
| 2026-05-01 | SRR-004 S-001 | Production dependencies use caret ranges instead of pinned versions | LOW | Open |
| 2026-07-17 | THREAT_MODEL TM-03 | `run_and_watch` returns `raw_output` UN-redacted to the agent (only errors[] redacted) | HIGH | Open - TRP-54 |
| 2026-07-17 | THREAT_MODEL TM-01 | `verify_mcp`/`start_server` run agent commands with no allowlist (metachar only) - re-confirms SRR-006 M-003, SRR-004 H-004 | HIGH | Open - TRP-56 |
| 2026-07-17 | THREAT_MODEL (env) | Full `process.env` inherited by spawned commands enables `bash -c env` secret harvest - re-confirms SRR-003 M-003 | HIGH | Open - TRP-55 |
| 2026-07-17 | THREAT_MODEL TM-02 | `run_and_watch` allowlist prefix admits `bash`/`sh`/`npx` (SRR-003 H-001) | HIGH | Accepted by design - reframed as classifier, TRP-53/59 |
| 2026-07-17 | THREAT_MODEL TM-04 | Prompt injection: ingested untrusted output surfaced to agent steers its tool calls | HIGH | Open (posture) - TRP-58 |
| 2026-07-17 | THREAT_MODEL TM-12 | Command `cwd` guard allows absolute paths outside project root (SRR-003 H-002 fixed relative only) | MEDIUM | Open - TRP-57 |
| 2026-07-17 | THREAT_MODEL TM-05 | `.tracepulse` store written at default umask (world-readable), no chmod | MEDIUM | Open - TRP-61 |
| 2026-07-17 | THREAT_MODEL TM-06 | Redaction coverage gaps - unknown secret formats bypass `redact()` (SRR-003 M-004) | MEDIUM | Open - TRP-62 |
| 2026-07-17 | THREAT_MODEL TM-08 | REST listener auth off by default (`TRACEPULSE_API_KEY` unset = open on loopback) | MEDIUM | Open - TRP-63 |
| 2026-07-17 | THREAT_MODEL TM-11 | Supply-chain: no lockfile/provenance/`npm audit` gate for public-npm publish | MEDIUM | Open - TRP-66 |
| 2026-07-17 | THREAT_MODEL TM-09 | Frontend collector origin check bypassable via absent Origin header (SRR-004 H-005); dormant | LOW | Open - TRP-64 |
| 2026-07-17 | THREAT_MODEL TM-10 | `register_probe` loopback SSRF allows any port (same-host recon) | LOW | Open - TRP-65 |
| 2026-07-17 | THREAT_MODEL TM-07 | ReDoS on parser regexes | LOW | Resolved - 10KB parse-input cap (constants/limits.ts:42) |
| 2026-07-17 | THREAT_MODEL TM-13 | Local JSONL journal not tamper-evident (repudiation) | LOW | Accepted / won't-fix - TRP-67 |
| 2026-07-17 | THREAT_MODEL TM-14 | Unbounded/detached spawns → workstation resource exhaustion | LOW | Open - folded into TRP-26 |
