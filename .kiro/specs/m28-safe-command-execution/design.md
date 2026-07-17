# M28: Safe Agent Command Execution — Design

**Date:** 2026-07-17 · **Status:** Planned (Phase A build-ready; Phase B pending B-0 confirmation) · **Ticket:** TRP-53 · **Requirements:** ./requirements.md
**Originated from:** the v0.9.31 STRIDE threat model → `docs/audits/security/THREAT_MODEL.md` (§6.5, threats TM-01/02/03/04/12)
**Reviewed:** ./spec-review.md — findings F1–F10 folded in below.

## 1. Principle

TracePulse is the instrumented command-execution **chokepoint**. A chokepoint is the one place to enforce
containment, sanitization, and policy uniformly. The design adds four safety properties raw shell never had —
**env-scope, output-redaction, cwd-confinement, audit** — without removing any agent capability.

```
agent ──stdio──▶ MCP tool (run_and_watch │ verify_mcp │ start_server)
                     │
                     ▼
         ┌─────────────────────────────┐
         │  command-policy (classify)  │  Green │ Amber │ Red        ← Feature 5 (TRP-59)
         └─────────────────────────────┘
                     │ (Amber → harness/hook confirm → session-approval)
                     ▼
         ┌─────────────────────────────┐
         │  exec-env builder (scrub)   │  pass-through MINUS secrets  ← Feature 1 (TRP-55)
         │  cwd resolver (confine)     │  within projectRoot         ← Feature 3 (TRP-57)
         └─────────────────────────────┘
                     │ spawn(shell:true[, sandbox])                  ← Feature 6 optional
                     ▼
              child process → stdout/stderr
                     │
                     ▼
         ┌─────────────────────────────┐
         │  output sanitizer           │  redact() + untrusted label ← Feature 2 (TRP-54/58)
         └─────────────────────────────┘
                     │
                     ▼  errors[] + raw_output (redacted, labeled)  →  agent
                     └─▶ audit journal (classification + command)
```

**Containment + sanitization apply to ALL tiers, including Green (see §3a) — they are the real security boundary,
independent of classification.**

## 2. New / changed modules

| Module | Responsibility | Notes |
|--------|----------------|-------|
| `src/tools/command-policy.ts` *(new)* | Classify a command → `{tier, reason, signature}` | Wraps `buildAllowlist()`; single source of truth used by all 3 exec tools (Feature 4). |
| `src/tools/exec-env.ts` *(new)* | Build the spawn env = pass-through minus secret-shaped vars + agent-declared `env` (§5) | Replaces `{...process.env}` spread in `run-and-watch.ts:186` & `process-spawner.ts:109`. |
| `src/tools/cwd-guard.ts` *(extract)* | Resolve + confine `cwd` within `projectRoot` (relative **and** absolute) | Extends the current `run-and-watch.ts:158-175` guard. |
| `src/tools/session-approvals.ts` *(new)* | Session-scoped store of Amber approvals (confirm-once → remember) | Keyed by per-argv signature (§4); expiry + revoke. |
| `src/pipeline/secret-redactor.ts` *(reuse)* | Redact `raw_output` too, with length-hint (§5.1) | Currently applied to parsed events only. |
| `run-and-watch.ts` / `verify-mcp.ts` / `start-server*.ts` | Call `command-policy` → `exec-env` → `cwd-guard` → spawn → sanitizer | Parity across the three (Feature 4). |

## 3. The classifier (Feature 5)

- **Green:** leading token matches `buildAllowlist()` **and** is not an interpreter invoking an arbitrary payload
  (`bash -c`, `sh -c`, `node -e`, `python -c`, a raw `*.sh`/script path). For `npx`: parse the target — a
  known/allowlisted dev tool (`npx eslint`, `npx tsc`) → Green; an **unknown package** → Amber (F5). Best-effort:
  registry names aren't trustworthy, so containment covers the residual.
- **Amber:** the escape hatch — allowlisted interpreter + arbitrary payload, `npx <unknown>`, or a non-allowlisted
  known interpreter/tool. Runs, but requires a session approval (§4).
- **Red:** best-effort destructive heuristics (`rm -rf` targeting `/`/`~`/outside cwd; `curl … | sh` to a
  non-loopback host; `:(){ :|:& };:`). Requires explicit confirm or sandbox.

The metachar denylist stays as a Green-tier guard (blocks chaining on the fast path); Amber/Red may legitimately
contain metacharacters, so they are governed by tier + confirmation instead.

### 3a. Classification is a friction gradient, NOT a sandbox (F4/F7)

Green/Amber/Red governs **friction, not capability**, and is **not** a security boundary. Green commands still run
arbitrary code — `npm test`/`npm run <x>` execute the project's `package.json` scripts, `make`/`cargo`/`gradle`
run arbitrary build logic. A compromised `package.json` script runs at full privilege on the frictionless path.

Therefore: **never gate a real security decision on tier alone.** The security boundary is Contain (§5 env-scrub,
cwd-confine) + Sanitize (§5.1 redaction), which are applied to **every** command regardless of tier. Red-tier
heuristics are a denylist and thus incomplete by nature (obfuscation bypasses them) — they are a UX foot-gun
guard, not a control, and we do not invest in an arms race there.

## 4. Confirmation trust model (F1 — resolved)

Amber exists for one case: **prompt injection**, where the agent's own judgment is compromised. So the human
checkpoint **must not depend on the agent.**

- **Primary (security-bearing): PreToolUse hook.** Ship a `tracepulse-gate.sh` variant so the host harness — outside
  the agent — renders the confirmation and gates the `run_and_watch`/`verify_mcp`/`start_server` MCP call for
  Amber/Red, matching a raw-Bash approval. This is the mechanism the security guarantee rests on.
- **Fallback (UX only, NOT a control): in-band result.** For harnesses without hook support, the tool returns
  `{ status: "confirmation_required", tier, command, signature, reason }` instead of executing; the user approves by
  re-issuing with `confirm: "<signature>"`. This is explicitly **not** a security boundary — a compromised agent can
  mishandle it. On a hook-less harness, Amber degrades to **contained-but-unconfirmed** (env-scrubbed, cwd-confined,
  output-redacted) rather than blocked — capability is never hard-removed.
- **Approval signature (F3):** the SHA-256 of the full argv **after** env-prefix stripping and normalization. Keyed
  per-exact-command, so a varied argument re-prompts by design (no blanket `bash -c` bypass). Approvals are
  session-scoped with a TTL and a `tp revoke` / clear path.
- **Audit:** every classification + approval decision is written to the event journal.

## 5. Exec-env builder — pass-through minus secrets (Feature 1, F2 — resolved)

A **bare-minimum** env breaks real dev commands (`NODE_ENV`, `CI`, `AWS_PROFILE`, app vars) and pushes users to a
blanket opt-out that nullifies the control. Instead, **default = pass-through MINUS secret-shaped vars:**

- **Drop** any var whose **name** matches `/(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|AWS_|AZURE_|GCP_|DATABASE_URL|DSN)/i`,
  or whose **value** matches a `constants/redaction.ts` pattern (defense in depth for oddly-named secrets).
- **Keep** everything else (so `NODE_ENV`, `CI`, `PATH`, locale, app config keep working), plus the existing
  computed additions (`PATH` augmented with `node_modules/.bin`/venv, `PYTHONUNBUFFERED=1`, `FORCE_COLOR=0`).
- **Project override:** a config `env.keep` / `env.drop` list to tune per-project.
- **Escape hatch:** `--inherit-env` disables all drops; it is **logged/audited** every use and surfaced by
  `tracepulse doctor` as a warning.
- **Rollout (F8):** behind a feature flag, default-on in v0.9.31 with a one-release opt-out grace + prominent
  CHANGELOG note; `tracepulse doctor` warns when a command likely depends on a dropped var.

Rationale: preserves the inner loop while removing the `bash -c env` secret-harvest surface — the actual win.

### 5.1 Output sanitization detail (Feature 2, F6)

`raw_output` passes through `redact()` before serialization (today only `errors[]` are redacted). To preserve
debugging value (raw_output exists so the agent sees real output), redaction emits a **length/type hint** rather
than an opaque blank — e.g. `sk-...[REDACTED:40]` — so the agent knows a value was present and how long. Returned
`errors[]` + `raw_output` are wrapped with an **untrusted-data** marker in the `CallToolResult` (Feature 2 / TRP-58).
A false-positive-rate test on representative dev output guards against over-redaction of legitimate values.

## 6. Sandbox adapter (Feature 6, optional/off)

`src/tools/sandbox/` with a `SandboxBackend` interface and `none` (default), `bubblewrap` (Linux),
`sandbox-exec` (macOS), `container` implementations. **No Windows backend v1** (env-scrub + cwd + redaction still
apply there). Selected by config; applies to Amber/Red when enabled. Kept behind an interface so the default path is
unchanged.

## 7. Audit (TM-13 residual)

The classifier decision + command signature are written to the existing event journal (`event-journal.ts`) so there
is a record of what ran through the chokepoint. Tamper-evidence remains out of scope for a local single-user tool
(TRP-67, accepted).

## 8. Backwards compatibility & rollout

- `env` param semantics become authoritative for *additions*; the default now drops secret-shaped vars (breaking for
  a command that relied on an inherited secret in its env) — mitigated by the F8 flag + `--inherit-env` + doctor warning.
- `confirmation_required` is a new result variant; agents that ignore it simply don't run Amber commands until they
  pass `confirm` (and, with the hook primary, the harness gates regardless).
- Green-tier behaviour (the 95% path) is unchanged.

## 9. Cross-fleet reuse (F10)

`command-policy` and `redact` solve a problem other ChaosLabz agent tools share. Before duplicating, evaluate
promoting them to a shared fleet library — write `docs/fleet-updates/*.patch` + a ticket rather than copy-paste.
