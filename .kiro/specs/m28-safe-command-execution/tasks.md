# M28: Safe Agent Command Execution — Tasks

**Date:** 2026-07-17 · **Status:** Planned
**Source:** v0.9.31 pre-release threat model → `docs/audits/security/THREAT_MODEL.md` (§6.5)
**Tickets:** TRP-53 (design) · TRP-54/55/56/57/58 (near-term) · TRP-59 (classifier) · TRP-60 (docs)
**Discipline:** TDD per task — RED (failing test for the right reason) → GREEN (minimal) → refactor. Regression test per fix.

---

## Phase A — Near-term containment & sanitization (v0.9.31, no capability loss)

> **STATUS 2026-07-17 — Phase A COMPLETE** on branch `feat/m28-safe-exec-phase-a` (strict TDD; 1376 tests green, typecheck + lint clean).
> A2 redact raw_output (`5459d2f`, TRP-54) · A1 env scrub (`12cccb9`, TRP-55) · A4 verify_mcp parity (`47be410`, TRP-56) ·
> A3 cwd audit-not-block (`e1963c9`, TRP-57) · A5 red-team suite (`3211e96`). Note: A3 reframed — an absolute cwd to another
> project is a documented capability, so it is surfaced (`cwd_outside_project_root`), not blocked. Allowlist/classifier parity
> for verify_mcp/start_server deferred to Phase B (TRP-59) to avoid breaking server commands.

### A1. Scrub child-process env — TRP-55 (High)
- [ ] RED: test that a **secret-shaped** var (`FOO_TOKEN`, `AWS_SECRET_ACCESS_KEY`) is dropped, while a **non-secret**
      var (`NODE_ENV`, `CI`) passes through (design §5, F2).
- [ ] Add `src/tools/exec-env.ts` — pass-through minus secret-shaped drops (name regex + value-pattern) + agent-declared
      `env` + project `env.keep`/`env.drop`.
- [ ] Replace `{...process.env}` in `run-and-watch.ts:186` and `process-spawner.ts:109` with `buildExecEnv()`.
- [ ] Add `--inherit-env` opt-out (logged/audited each use) + `tracepulse doctor` warning.
- [ ] Feature flag, default-on, one-release opt-out grace + CHANGELOG note (F8).
- [ ] GREEN + regression (positive: `NODE_ENV` passes; negative: `*_TOKEN`/value-matched secret dropped; `bash -c env`
      shows no secrets).

### A2. Redact `raw_output` + label untrusted — TRP-54 / TRP-58 (High / Medium)
- [ ] RED: test that a known secret in child stdout is redacted with a **length hint** (`[REDACTED:40]`) in `raw_output`.
- [ ] Pipe `rawLines` through `redact()` (length-hint variant, F6) before serializing `raw_output` (`run-and-watch.ts:286-295`).
- [ ] Wrap `errors[]` + `raw_output` with an untrusted-data marker in the `CallToolResult`.
- [ ] GREEN + regression + **false-positive-rate test** on representative dev output (F6).

### A3. Cwd confinement — TRP-57 (Medium)
- [ ] RED: test that an absolute `cwd` outside `projectRoot` is rejected; inside is allowed.
- [ ] Extract `src/tools/cwd-guard.ts`; extend guard to validate absolute paths within `projectRoot`.
- [ ] Wire into `run-and-watch.ts` (and the shared path for A4).
- [ ] GREEN + regression.

### A4. Guardrail parity — TRP-56 (High)
- [ ] RED: test that the same command classifies/gates identically via `run_and_watch`, `verify_mcp`, `start_server`.
- [ ] Route `verify-mcp.ts` and `start-server*` through the shared validation (interim: `buildAllowlist()` + guards;
      final: the classifier from Phase B).
- [ ] GREEN + regression (a non-allowlisted command is no longer a weaker side-door).

---

### A5. Security red-team / bypass suite — DoD gate (F9)
- [ ] Bypass tests: env exfil post-scrub, redaction evasion (novel/split secrets), cwd escape variants. (Classifier-evasion
      and approval-signature cases added in Phase B.) Must pass before Phase A ships.

---

## Phase B-0 — Decisions gate (before ANY classifier code) — TRP-59

Confirm the `spec-review.md` resolutions now baked into design.md §3a/§4/§5:
- [ ] **F1** confirmation trust model = PreToolUse hook **primary**, in-band `confirmation_required` = UX fallback only.
- [ ] **F3** approval signature = SHA-256 of normalized argv, session TTL + revoke.
- [ ] **F4/F7** classification = friction gradient, not a sandbox (containment is the boundary, tier-independent).
- [ ] **F5** npx target parsing: known tool → Green, unknown pkg → Amber (best-effort).
Sign-off gate: update design.md if any decision changes, then re-run `review-spec-readiness`.

---

## Phase B — Command classifier + confirmation (spec milestone) — TRP-59

### B1. Classifier module
- [ ] RED: table-driven tests mapping representative commands → `green | amber | red` (design §3).
- [ ] Add `src/tools/command-policy.ts` (`classify(command, allowlist, projectRoot)`), wrapping `buildAllowlist()`.
- [ ] Green = allowlist match + no arbitrary-interpreter payload; Amber = escape hatch; Red = destructive heuristics.
- [ ] Route all three exec tools through it (completes A4).

### B2. PreToolUse hook — PRIMARY confirmation (F1, security-bearing)
- [ ] Ship a `tracepulse-gate.sh` variant so the harness (outside the agent) renders/gates the Amber/Red MCP call.
- [ ] RED: an Amber command is gated by the hook independent of agent cooperation.
- [ ] Document the residual for hook-less harnesses (Amber → contained-but-unconfirmed).

### B3. Session approvals + in-band fallback (UX, NOT a control)
- [ ] Add `src/tools/session-approvals.ts` — keyed by **SHA-256 of normalized argv** (design §4, F3), TTL + `tp revoke`.
- [ ] Implement the `confirmation_required` result variant + `confirm` param as the hook-less **fallback** (explicitly
      not a security boundary).
- [ ] Log classification + approval decisions to the event journal (audit; TM-13 context).
- [ ] Add classifier-evasion + approval-signature-confusion cases to the A5 red-team suite.

---

## Phase C — Optional sandbox — TRP-59 follow-on (Low)
- [ ] `src/tools/sandbox/` with `SandboxBackend` interface + `none` default.
- [ ] `bubblewrap` (Linux) and `sandbox-exec` (macOS) backends; config-selected; off by default.
- [ ] Apply to Amber/Red when enabled, with scrubbed env + confined cwd.

---

## Phase D — Positioning & docs — TRP-60 (Medium)
- [ ] README "Security by design" note (near Security & Reviews): the instrumented chokepoint adds env/output/cwd/audit
      safety raw shell never had. Reference `docs/audits/security/THREAT_MODEL.md`.
- [ ] GitBook security page mirroring it.
- [ ] Claims limited to controls actually shipped; update on each phase landing.

---

## Definition of done (per phase)
- All tasks' tests green (via TracePulse's own MCP: tsc / test / build — no shell-out).
- No agent capability removed (Green auto; Amber after one confirm).
- Changelog + roadmap + the owning tickets updated; finding tickets flipped to Fixed as their fix lands.
