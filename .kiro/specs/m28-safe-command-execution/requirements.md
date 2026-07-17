# M28: Safe Agent Command Execution — Requirements

**Date:** 2026-07-17
**Status:** Planned
**Source:** v0.9.31 pre-release threat model (`docs/audits/security/THREAT_MODEL.md`, TRP-41) + design session 2026-07-17
**Design ticket:** TRP-53 · **Near-term fixes:** TRP-54/55/56/57/58 · **Classifier:** TRP-59 · **Docs:** TRP-60

## Overview

By design, the coding agent routes its debug/ad-hoc/dev shell through TracePulse's structured routes
(`run_and_watch`, `verify_mcp`, `start_server`) so it gets logging, analysis, and short summaries back instead of
sifting GBs of raw output. `tracepulse init` deny-hooks raw Bash and auto-approves the TP tools (TRP-21). TracePulse
is therefore the command-execution **chokepoint** on purpose.

The threat model established that this routing loses ~nothing on *authorization* (the agent decides the command
either way; per-command allow/deny is theater against a trusted-but-hijackable agent). The safety that matters —
**env-scope, output-redaction, cwd-confinement, audit** — was never in a command gate, and raw Bash never provided
it. So this milestone does **not** restrict what agents may run; it makes the chokepoint *contain* and *sanitize*
every execution — net-new safety that only a single instrumented route can offer.

**Non-negotiable:** no feature here may remove agent capability. `bash`/`sh`/`npx`/arbitrary scripts keep working.

---

## Feature 1: Least-privilege execution environment (Contain)

**Ticket:** TRP-55 · **Priority:** High

### User Story
As a developer, I want commands the agent runs through TracePulse to NOT receive my full secret-laden environment,
so an injected or buggy command cannot harvest my secrets via `bash -c env`.

### Acceptance Criteria
1. Spawned commands no longer inherit `...process.env` wholesale (today: `run-and-watch.ts:186`, `process-spawner.ts:109`).
2. **Default = pass-through MINUS secret-shaped vars** (F2, design §5): drop any var whose name matches
   `/(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|AWS_|AZURE_|GCP_|DATABASE_URL|DSN)/i` or whose value matches
   a redaction pattern; **keep everything else** (so `NODE_ENV`, `CI`, app config keep working). This preserves the
   inner loop while removing the secret-harvest surface — a bare-minimum env is explicitly rejected as it breaks real
   commands and drives users to a blanket opt-out.
3. Agent-declared `env` vars are always passed; a project `env.keep`/`env.drop` config tunes the policy.
4. `--inherit-env` disables all drops, is **logged/audited** on every use, and is surfaced as a `tracepulse doctor` warning.
5. Feature-flagged, default-on in v0.9.31 with a one-release opt-out grace + prominent CHANGELOG note (F8).
6. Regression: a secret-shaped env var on the TP process is NOT visible in a spawned command's output; a non-secret
   var (e.g. `NODE_ENV`) IS.

### Out of Scope
- Network egress control on children (needs sandboxing — Feature 6).

---

## Feature 2: Output sanitization (Sanitize)

**Tickets:** TRP-54 (redact raw_output), TRP-58 (untrusted label) · **Priority:** High

### User Story
As a developer, I want everything TracePulse hands back to the agent to be secret-redacted and marked untrusted,
so command output cannot leak my secrets into the agent's context or carry injection into its decisions.

### Acceptance Criteria
1. `run_and_watch` `raw_output` passes through `redact()` before serialization (today only `errors[]` are redacted).
2. Returned `errors[]` and `raw_output` are wrapped/labeled as **untrusted data** in the `CallToolResult`.
3. Redaction of `raw_output` uses the same pattern set as the pipeline (`constants/redaction.ts`).
4. **Length/type hint** on redaction to preserve debugging value (F6): e.g. `sk-...[REDACTED:40]`, not an opaque blank,
   so the agent knows a value was present and how long.
5. Regression: a known secret printed by a child appears redacted (with hint) in `raw_output`; plus a
   **false-positive-rate test** on representative dev output so legitimate values (IDs, hashes, fixtures) aren't over-redacted.

---

## Feature 3: Cwd confinement (Contain)

**Ticket:** TRP-57 · **Priority:** Medium

### User Story
As a developer, I want agent commands confined to my project root, so a command can't be run with a working
directory outside the project.

### Acceptance Criteria
1. Absolute `cwd` values are validated to resolve within `projectRoot` (today: relative-only guard, `run-and-watch.ts:158-175`; SRR-003 H-002 fixed relative).
2. A `cwd` outside the project root is rejected with a clear message.
3. Regression: absolute `cwd` outside the project is rejected; inside is allowed.

---

## Feature 4: Guardrail parity across exec tools (Govern)

**Ticket:** TRP-56 · **Priority:** High

### User Story
As a developer, I want `verify_mcp` and `start_server` to apply the same command guardrail as `run_and_watch`, so
there is no weaker side-door.

### Acceptance Criteria
1. `verify_mcp` (`verify-mcp.ts:118`) and `start_server`/`process-spawner` route through the shared classifier
   (Feature 5) / the same validation as `run_and_watch` — not just the metachar denylist.
2. Behaviour is identical across the three tools for the same command.
3. Regression: a command classified Amber via `run_and_watch` is classified Amber via `verify_mcp`/`start_server`.

---

## Feature 5: Command classifier — Green / Amber / Red (Govern)

**Ticket:** TRP-59 · **Priority:** Medium (spec milestone)

### User Story
As a developer, I want recognized dev commands to run frictionlessly while the escape hatch (bash/npx/scripts) is
governed, so agent capability is preserved but injected commands get one human checkpoint.

### Acceptance Criteria
1. **Classification is a friction gradient, NOT a sandbox** (F4/F7, design §3a): Green still runs arbitrary code
   (`npm test`, `make`). The security boundary is Contain (Feature 1/3) + Sanitize (Feature 2), applied to **all**
   tiers including Green. Never gate a security decision on tier alone.
2. The allowlist becomes a **classifier**, not a gate:
   - **Green** — allowlist-matched dev command, no arbitrary-interpreter payload → run, instrumented, no prompt.
     `npx <known-tool>` → Green; `npx <unknown-pkg>` → Amber (F5, best-effort).
   - **Amber** — `bash -c`/`sh -c`/`npx <unknown>`/raw scripts → run + instrument, with a **confirm-once then
     session-remember** checkpoint. Not silently auto-approved.
   - **Red** — best-effort destructive heuristics (`rm -rf` broad, external `curl|sh`, writes outside project) →
     explicit confirm or (Feature 6) sandbox. Denylist = incomplete by nature; a UX guard, not a control.
3. **Confirmation is agent-independent (F1):** the security-bearing checkpoint is the **PreToolUse hook** (rendered by
   the harness, outside the agent). The in-band `confirmation_required` result is a UX fallback for hook-less
   harnesses, explicitly NOT a security boundary; there, Amber degrades to contained-but-unconfirmed, never blocked.
4. **Approval signature (F3):** SHA-256 of the normalized argv (post env-prefix strip), session-scoped with TTL +
   `tp revoke`. Per-exact-command, so a varied argument re-prompts (no blanket `bash -c` bypass).
5. Growing the allowlist only extends the **Green** fast path; it never widens a security hole.
6. Classification + approval decisions are logged to the audit journal.

> **Phase B-0 gate:** the AC 1/3/4 decisions above are the recommended resolutions from `spec-review.md`; confirm
> them before implementing the classifier (Phase B). Phase A (Features 1–4) does not depend on this feature.

---

## Feature 6: Optional sandbox backend (Isolation)

**Ticket:** TRP-59 (follow-on) · **Priority:** Low

### User Story
As a security-conscious team, I want an opt-in sandboxed execution mode for Amber/Red commands, so untrusted-ish
commands run contained.

### Acceptance Criteria
1. Opt-in only (config/flag); **off by default** (dev toolchains need the real environment).
2. Pluggable backend: container / `bubblewrap` (Linux) / `sandbox-exec` (macOS).
3. When enabled, Amber/Red commands execute in the sandbox with the scrubbed env and confined cwd.

---

## Feature 7: Positioning & docs

**Ticket:** TRP-60 · **Priority:** Medium

### User Story
As a prospective user, I want to understand that routing agent shell through TracePulse *adds* safety, so I see the
security value, not just the observability value.

### Acceptance Criteria
1. README "Security by design" note + a GitBook page: raw agent shell gives no env-scoping, no output redaction, no
   cwd confinement, no audit; TracePulse's single instrumented route gives all four.
2. Claims are limited to controls actually shipped in the release.
3. Links to `docs/audits/security/THREAT_MODEL.md`.

---

## Global Non-Functional

- **No capability regression:** every command runnable before is still runnable (Green auto, Amber after one confirm;
  contained-but-unconfirmed on hook-less harnesses — never hard-blocked).
- **Performance:** classification + env-build add < 5 ms per command.
- **Reuse:** compose existing `redact()`, `buildAllowlist()`, `resolvePath` — no duplicated logic.
- **Backwards-compatible tool contracts:** the env default change is feature-flagged (F8); `confirmation_required` is a
  new result variant.
- **Security red-team gate (F9, DoD):** a bypass suite must pass — env exfil post-scrub, redaction evasion (novel/split
  secrets), classifier evasion (Green-looking wrapper around an Amber payload), approval-signature confusion, cwd escape.
