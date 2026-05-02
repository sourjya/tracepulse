# Security

## Secret Redaction

All log output is redacted before entering the pipeline. 16 patterns:

- PEM private keys
- AWS access keys
- JWT tokens
- GitHub/GitLab/Slack tokens
- Stripe keys (sk_live_, pk_live_)
- npm tokens
- OpenAI/Anthropic API keys (sk-)
- GCP service account private keys
- Azure storage connection strings (AccountKey)
- Datadog API/app keys (DD_API_KEY, DD_APP_KEY)
- Bearer/Basic auth tokens
- Connection string credentials
- Key-value secrets (password=, token=, secret=, etc.) including quoted values

## Localhost Only

HTTP endpoints bind to `127.0.0.1` only:
- MCP HTTP transport: port 9800
- Log collector: port 9801

## Command Allowlist

[`run_and_watch`](../features/mcp-tools.md#run_and_watch) only executes commands starting with: npx, npm, node, pytest, python, tsc, eslint, vitest, jest, go test, cargo test, uv, .venv/bin/python, .venv/bin/pytest.

## No Raw Messages in Persistence

Fingerprint persistence stores only hashes and counts. No error text or stack traces on disk.

## Rate Limiting

Log collector HTTP server: 100 requests/second token bucket. Returns 429 when exceeded.
