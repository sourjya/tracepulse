/**
 * Secret redaction patterns for the TracePulse pipeline.
 *
 * Every raw log line passes through the secret redactor before entering
 * the pipeline. These regex patterns match common credential formats.
 * All matches are replaced with the REDACTION_REPLACEMENT string.
 *
 * Patterns are compiled once at module load and reused per-call.
 * Order matters: more specific patterns (e.g., AWS keys) should come
 * before generic ones (e.g., key-value secrets) to avoid partial matches.
 */

/** Replacement string for redacted secrets. */
export const REDACTION_REPLACEMENT = "[REDACTED]";

/**
 * Named redaction patterns. Each entry is a [name, regex] tuple.
 * The name is used for logging which pattern matched (never the secret itself).
 */
export const REDACTION_PATTERNS: ReadonlyArray<
  readonly [name: string, pattern: RegExp]
> = [
  // PEM private key blocks - match the entire block marker
  ["pem-key", /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g],

  // AWS access key IDs - exactly AKIA followed by 16 uppercase alphanumeric chars
  ["aws-key", /AKIA[0-9A-Z]{16}/g],

  // JWT tokens - three base64url segments separated by dots
  ["jwt", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g],

  // GitHub tokens - ghp_ (personal), gho_ (OAuth), ghs_ (server), ghr_ (refresh)
  ["github-token", /gh[psohr]_[A-Za-z0-9_]{36,}/g],

  // GitLab personal access tokens
  ["gitlab-token", /glpat-[A-Za-z0-9_-]{20,}/g],

  // Slack tokens - bot and user tokens
  ["slack-token", /xox[bp]-[A-Za-z0-9-]+/g],

  // OpenAI / Anthropic style API keys - sk- prefix
  ["api-key-sk", /sk[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{20,}/g],

  // Bearer tokens in Authorization headers - preserve "Bearer " prefix
  ["bearer-token", /(?<=Bearer\s)[A-Za-z0-9\-._~+/]+=*/g],

  // Basic auth in Authorization headers - preserve "Basic " prefix
  ["basic-auth", /(?<=Basic\s)[A-Za-z0-9+/]+=*/g],

  // Connection string credentials - ://user:pass@host pattern
  ["connection-string", /:\/\/[^:/?#]+:[^@/?#]+@/g],

  // Key-value secrets - password=xxx, secret: xxx, token=xxx, etc.
  [
    "key-value-secret",
    /(?:password|passwd|secret|token|api_key|apikey|access_key|private_key|auth_token|client_secret)\s*[=:]\s*\S+/gi,
  ],
] as const;
