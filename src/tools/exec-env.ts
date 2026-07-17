/**
 * Least-privilege environment builder for spawned commands (TRP-55, SRR-003 M-003).
 *
 * Both spawn paths previously inherited the FULL process.env, so any command the
 * agent ran (e.g. `bash -c env`) could harvest every developer secret straight
 * into its output — and, before TRP-54, into the agent context un-redacted.
 *
 * Policy = pass-through MINUS secret-shaped vars: keep ordinary config so the
 * developer inner loop still works (NODE_ENV, CI, AWS_REGION, ...), but drop any
 * var whose NAME looks like a credential or whose VALUE matches a redaction
 * pattern. A bare-minimum allowlist was rejected in design because it breaks real
 * commands and drives users to a blanket opt-out that nullifies the control.
 *
 * @see .kiro/specs/m28-safe-command-execution/design.md §5
 */

import { redact } from "@/pipeline/secret-redactor.js";

/**
 * Names that indicate a credential. Matched on whole `_`-delimited tokens (so
 * `MONKEY` is not caught by `KEY`, but `API_KEY`, `AWS_SECRET_ACCESS_KEY`,
 * `_TOKEN` are). Cloud creds are covered by the token rule (AWS_SECRET_ACCESS_KEY,
 * AWS_SESSION_TOKEN, GOOGLE_APPLICATION_CREDENTIALS, AZURE_CLIENT_SECRET), so we
 * do NOT drop the whole `AWS_*` prefix — that would kill non-secret vars like
 * AWS_REGION / AWS_PROFILE and break the aws CLI.
 */
const SECRET_NAME =
  /(^|_)(KEY|KEYS|TOKEN|TOKENS|SECRET|SECRETS|PASSWORD|PASSWD|PWD|CREDENTIAL|CREDENTIALS|PRIVATE)($|_)|(^|_)(DATABASE_URL|DSN)($|_)/i;

/** True when a var should be dropped from a child's environment. */
function isSecretShaped(name: string, value: string | undefined): boolean {
  if (SECRET_NAME.test(name)) return true;
  // Value-based catch for oddly-named secrets (reuses the redactor, no dup patterns).
  if (value && redact(value) !== value) return true;
  return false;
}

export interface BuildExecEnvOptions {
  /** Opt-out: inherit the full environment unchanged (`--inherit-env`). Logged by the caller. */
  inheritAll?: boolean;
  /** Source environment. Defaults to process.env. Injectable for tests. */
  source?: NodeJS.ProcessEnv;
}

/**
 * Build a scrubbed environment for a spawned command.
 *
 * @param declared - Vars the agent explicitly declared via the tool `env` param;
 *   always passed through (explicit intent overrides the drop policy).
 * @param opts - {@link BuildExecEnvOptions}.
 * @returns The environment to hand to child_process.spawn.
 */
export function buildExecEnv(
  declared?: Record<string, string>,
  opts?: BuildExecEnvOptions,
): Record<string, string | undefined> {
  const source = opts?.source ?? process.env;
  const out: Record<string, string | undefined> = {};

  for (const [name, value] of Object.entries(source)) {
    if (!opts?.inheritAll && isSecretShaped(name, value)) continue;
    out[name] = value;
  }

  // Agent-declared vars always pass through (explicit intent).
  if (declared) Object.assign(out, declared);

  return out;
}
