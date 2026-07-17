# M28 Spec-Readiness Review

**Reviewer lens:** `.kiro/prompts/review-spec-readiness.md` (principal architect / security / delivery-risk)
**Date:** 2026-07-17 · **Reviewed:** requirements.md, design.md, tasks.md
**Origin threat model:** `docs/audits/security/THREAT_MODEL.md` §6.5 · **Tickets:** TRP-53/54/55/56/57/58/59/60

---

## A. Executive Summary

1. **Input maturity tier:** Tier 2 — Draft Spec (structured, security-focused, freshly authored).
2. **Build-readiness verdict:** **CONDITIONALLY READY.** Phase A (Contain + Sanitize + parity) is ready to build now. Phase B (classifier + confirmation) is **NOT ready** — it has unresolved design contradictions that will cause rework if built as written.
3. **Explanation:** The spec's near-term half is genuinely strong: env-scrub, output-redaction, and cwd-confinement are well-scoped, testable, high-value, and cost no capability. But the classifier half rests on **the single most dangerous assumption in the spec: that the Amber "confirm-once" backstop provides a security guarantee — when the confirmation is delivered *through the very agent that is compromised in the injection case it exists to catch.*** The highest-cost gap is **env-scrub breaking the developer inner loop**: a minimal base env will silently break commands that need `NODE_ENV`/`CI`/`AWS_PROFILE`/app vars, pushing users to the `--inherit-env` opt-out that nullifies the control.
4. **Top 3 strengths:**
   - Correct core thesis — safety = containment + sanitization at the chokepoint, not command restriction; capability is explicitly preserved.
   - Phase A fixes are small, independently shippable, and each has a concrete regression test.
   - Strong reuse posture (compose `redact()`, `buildAllowlist()`, `resolvePath`); grounded in real `file:line` evidence.
5. **Top 10 gaps (ranked by fix-cost-now-vs-later × rework probability):** see Section C — F1 (confirmation via untrusted agent), F2 (env-scrub breakage), F3 (approval signature granularity), F4 (Green tier still runs arbitrary code — don't over-trust classification), F5 (npx target opacity), F6 (redaction false-positives degrade debugging), F7 (Red-tier denylist incompleteness), F8 (breaking-change rollout/flag strategy), F9 (no red-team/abuse test plan), F10 (Windows sandbox gap + cross-fleet reuse).
6. **3 roadmap sequencing changes:** (a) Ship Phase A independently of Phase B — it needs no classifier. (b) Insert a **Phase B-0 decisions gate** (confirmation trust model + signature granularity) before any classifier code. (c) Move the PreToolUse-hook path from "optional defense-in-depth" to **the primary Amber security mechanism**; the in-band `confirmation_required` is UX, not a control.
7. **Biggest "future regret":** Building the classifier as the security boundary, discovering post-ship that Amber confirmations are agent-forgeable, and having to re-architect confirmation into the harness layer after agents already depend on the in-band protocol.
8. **First 3 decisions before any Phase B work:** (1) Where does the human actually confirm — harness/hook or in-band? (2) What is an approval keyed on (exact command / normalized signature / interpreter+payload hash)? (3) Is classification a *security control* or a *UX friction gradient*? (State it — it changes what correctness means.)

---

## B. Spec Readiness Scorecard

| Area | Score | One-line note |
|------|-------|---------------|
| Problem framing | Strong | Chokepoint thesis is explicit and correct. |
| User/persona clarity | Adequate | "Developer" + "the agent" clear; missing the *security-conscious team* persona for sandbox. |
| CUJs/workflows | Weak | No end-to-end journey for the Amber confirm flow (who sees it, how they approve, what the agent does while blocked). |
| Scope/non-goals | Adequate | "No capability regression" is a good anti-goal; sandbox correctly deferred. |
| Domain model | Adequate | Tiers/signatures/approvals implied; "command signature" not defined. |
| State/lifecycle | Weak | Session-approval lifecycle (grant → remember → expiry → revoke) unspecified. |
| Security model | Adequate | Containment layers strong; the govern layer's trust model has a contradiction (F1). |
| Access control model | N/A | Single local user; no multi-actor authz matrix. |
| Threat model | Strong | Directly derived from the committed STRIDE model. |
| Privacy/data | Strong | Secret handling is the spec's core. |
| API/contract | Weak | `confirmation_required` result variant + `confirm` param + `env` semantics change the tool contract; versioning/compat only lightly noted. |
| Architecture maintainability | Strong | Clean module split; single classifier source of truth. |
| Observability | Weak | Journals classifications but no metrics to tune the classifier or measure Amber/Red rates. |
| Testing strategy | Adequate | Good unit/regression coverage; missing an explicit red-team/bypass suite. |
| CI/CD/release | Weak | Env-scrub is breaking; no feature-flag/staged-rollout plan. |
| Dependency risk | Adequate | Sandbox backends are external (bubblewrap/sandbox-exec) — platform-conditional. |
| Performance/cost | Adequate | <5ms budget stated; fine. |
| AI/agent controls | Adequate | Prompt-injection posture present; confirmation-via-agent contradiction (F1) is the gap. |
| Regulatory/compliance | N/A | Local OSS tool, no customer data. |
| Multi-tenancy | N/A | Single-user local process. |
| Business continuity/DR | N/A | No service; local files, gitignored. |
| i18n/L10n | N/A | Developer CLI/agent tool; English diagnostics. |
| Commercial model | N/A | OSS; (positioning value tracked in TRP-60). |
| Support/ops readiness | Adequate | Local tool; the `--inherit-env`/opt-out ergonomics are the main "support" surface. |
| Roadmap sequencing | Adequate | Phases sensible; needs the B-0 decisions gate (Section F). |

---

## C. High-Priority Findings

### F1 — Amber confirmation is delivered through the untrusted agent (contradiction)
- **Severity:** High · **Category:** Security / AI-agent controls · **Scope:** Feature 5, design §4.
- **Evidence:** design §4.1–4.2 — the tool returns `confirmation_required` to the agent, which "surfaces this to the user." The agent then relays approval via `confirm: <signature>`.
- **Why it matters:** Amber exists for exactly one case — **prompt injection**, where the agent's judgment is compromised. Routing the human checkpoint *through that same agent* means the compromised agent can decline to surface it, paraphrase it misleadingly, or (if it can synthesize the signature) self-approve. The backstop is weakest precisely when it's needed.
- **Predicted issue if ignored:** A shipped "confirm-once" control that provides false assurance; a later CVE-class report that Amber is agent-forgeable.
- **Rework cost if late:** High (months) — re-architecting confirmation after agents depend on the in-band contract.
- **Spec upgrade:** Make the **PreToolUse-hook path (design §4.4) the primary** Amber mechanism — the harness (outside the agent) renders the confirm and gates the MCP call, matching a raw-Bash approval. The in-band `confirmation_required` becomes a UX fallback for harnesses without hook support, explicitly labeled *not* a security boundary. Document the residual for hook-less harnesses.
- **Decision urgency:** Must decide now (blocks Phase B).

### F2 — Env-scrub will break real dev commands; the opt-out nullifies the control
- **Severity:** High · **Category:** UX readiness / delivery risk · **Scope:** Feature 1 (TRP-55).
- **Evidence:** requirements F1 — "minimal base env … additional vars only when the agent declares them via `env`" + "`--inherit-env` opt-out."
- **Why it matters:** Many commands need env the agent can't enumerate (`NODE_ENV`, `CI`, `AWS_PROFILE`, `DATABASE_URL` for integration tests, arbitrary app vars). Silent breakage teaches the agent/user to reach for `--inherit-env`, which restores full-env inheritance and defeats the whole containment win.
- **Predicted issue if ignored:** Adoption failure or a de-facto-always-on opt-out; the secret-harvest surface remains.
- **Rework cost if late:** Medium (weeks) — retuning the env policy after user complaints.
- **Spec upgrade:** Specify a **smarter default**, not a bare minimum: pass through non-secret-looking vars by allowlist-of-shape (drop only vars matching the redaction patterns / known-secret names like `*_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, `AWS_*`, `DATABASE_URL`), and let the project declare a keep-list in config. Reserve `--inherit-env` as an audited escape hatch, and **log** every use. Add a migration note.
- **Decision urgency:** Must decide now (shapes Phase A implementation).

### F3 — Session-approval signature granularity is unspecified and security-critical
- **Severity:** High · **Category:** Domain model / security · **Scope:** Feature 5, design §4.
- **Evidence:** design §4.3 "keyed by normalized command signature"; normalization undefined.
- **Why it matters:** If keyed on the exact string, an attacker varies one arg to force re-prompt (annoying) — or worse, if keyed on a coarse prefix (`bash -c`), one approval green-lights *all* future `bash -c` for the session (a blanket bypass). The normalization granularity *is* the security property.
- **Rework cost if late:** Medium–High.
- **Spec upgrade:** Define the signature explicitly (recommend: hash of the full argv after env-prefix stripping, so approvals are per-exact-command; document that similar-but-different commands re-prompt by design). Add expiry + a `tp revoke` path.
- **Decision urgency:** Must decide now.

### F4 — Green tier still executes arbitrary code; do not let it read as "safe"
- **Severity:** Medium · **Category:** Security model clarity · **Scope:** Feature 5.
- **Evidence:** `npm test`/`npm run <x>` are Green but run arbitrary project scripts (package.json), and `make`/`cargo`/etc. run arbitrary build logic.
- **Why it matters:** If the team treats Green as "trusted," a compromised `package.json` script or Makefile runs at full privilege on the frictionless path. This *reinforces* that classification is UX, not a security boundary, and that Contain+Sanitize (which apply to ALL tiers) are the real controls.
- **Spec upgrade:** State as an explicit design principle: "Classification is a friction gradient, not a sandbox. Containment (env, cwd) and sanitization (redaction) apply to **all** tiers including Green, precisely because Green still runs arbitrary code." Ensure env-scrub/redaction are tier-independent in the design (they are — make it explicit).
- **Decision urgency:** Before MVP (wording + ensure tier-independence).

### F5 — `npx <pkg>` target opacity
- **Severity:** Medium · **Category:** Security / classifier correctness · **Scope:** Feature 5.
- **Evidence:** `npx` is allowlisted (Green base) but downloads and executes arbitrary packages; classifier can't tell `npx eslint` from `npx some-evil-pkg` without parsing the target.
- **Spec upgrade:** Classifier parses the npx target: known dev tools → Green; unknown package → Amber. Document that this is best-effort (registry names aren't trustworthy) and that containment covers the residual.
- **Decision urgency:** Before MVP (Phase B).

### F6 — Redacting `raw_output` can degrade debugging (false positives)
- **Severity:** Medium · **Category:** UX / testing · **Scope:** Feature 2.
- **Why it matters:** `raw_output` exists so the agent sees real output to debug. Over-eager redaction may scrub legitimate values (test fixtures resembling tokens, hashes, IDs), reducing diagnostic value — the product's whole point.
- **Spec upgrade:** Accept the tradeoff explicitly; add tests for false-positive rate on representative dev output; consider a redaction that preserves a short prefix/length hint (`sk-...[REDACTED:40]`) so the agent knows a value was present. Keep raw_output redaction on by default.
- **Decision urgency:** Before MVP.

### F7 — Red-tier heuristics are a denylist (inherently incomplete)
- **Severity:** Medium · **Category:** Security model honesty · **Scope:** Feature 5, design §3.
- **Spec upgrade:** Frame Red as best-effort UX ("catch obvious foot-guns"), not a security control; obfuscation bypasses it, and that's acceptable because containment is the real boundary. Don't invest in an arms race here.
- **Decision urgency:** Before MVP (framing).

### F8 — Env-scrub is a breaking change with no rollout/flag plan
- **Severity:** Medium · **Category:** CI/CD / release · **Scope:** Feature 1.
- **Spec upgrade:** Add a feature flag (default-on in a minor, with a one-release opt-out grace + prominent changelog/CHANGELOG note), and a `tracepulse doctor` check that warns if commands are likely relying on scrubbed vars.
- **Decision urgency:** Before the v0.9.31 ship.

### F9 — No explicit red-team / abuse-case test plan for a security feature
- **Severity:** Medium · **Category:** Testing · **Scope:** whole milestone.
- **Spec upgrade:** Add a bypass suite: attempt env exfil post-scrub, redaction evasion (novel secret shapes, split across lines/chunks), classifier evasion (Green-looking wrapper around Amber payload), approval-signature confusion, cwd escape variants. Make it a DoD gate.
- **Decision urgency:** Before MVP.

### F10 — Windows sandbox gap + cross-fleet reuse not addressed
- **Severity:** Low · **Category:** Dependency / maintainability · **Scope:** Feature 6.
- **Spec upgrade:** State that sandbox is Linux/macOS only (Windows/WSL: no sandbox backend v1; env+cwd+redaction still apply). Flag `command-policy`/`redact` as candidate **shared fleet libraries** (other ChaosLabz agent tools face the same problem) → write `docs/fleet-updates/*.patch` + a ticket rather than copy-paste later.
- **Decision urgency:** Can defer (note now).

---

## D. Predicted Issues to Avoid

| Likely future problem | Why this spec permits it | Cost of late discovery | Prevention to add now |
|---|---|---|---|
| "Confirm-once" is agent-forgeable | Confirmation flows through the agent (F1) | High | Make the hook path primary |
| Everyone runs `--inherit-env` | Bare-minimum env breaks commands (F2) | Medium | Smarter secret-shaped-drop default |
| Blanket `bash -c` approval | Coarse approval signature (F3) | Medium | Per-argv-hash signature + expiry |
| False sense of Green safety | Green runs arbitrary scripts (F4) | Medium | State classification ≠ sandbox; containment is tier-independent |
| Debugging value lost | raw_output over-redaction (F6) | Low | Length-hint redaction + FP tests |

## E. Strengthened Spec Additions (draft content)

**Add to design.md — §3a "Classification is a friction gradient, not a sandbox":** "Green/Amber/Red governs *friction*, not *capability*, and is not a security boundary — Green commands (`npm test`, `make`) still run arbitrary project code. The security boundary is Contain (env-scrub, cwd-confine) + Sanitize (redaction), which apply to **all tiers including Green**. Never gate a real security decision on tier alone."

**Add to design.md — §4a "Confirmation trust model":** "The security-bearing confirmation is the **PreToolUse hook** rendered by the harness, outside the agent's control. The in-band `confirmation_required` result is a convenience for hook-less harnesses and is explicitly NOT a security boundary (a compromised agent can mishandle it). For hook-less harnesses, document that Amber degrades to 'contained-but-unconfirmed' (env-scrubbed, redacted) rather than blocked."

**Add to design.md — §5a "Env policy (default)":** "Default = pass-through MINUS secret-shaped drops: drop any var whose name matches `/(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AWS_|AZURE_|GCP_|DATABASE_URL|DSN|PRIVATE)/i` or whose value matches a redaction pattern; keep the rest. Project may add keep/drop lists in config. `--inherit-env` disables all drops and is logged. Rationale: preserves the inner loop while removing the secret-harvest surface."

**Add to requirements.md — NFR "Security test gate":** the F9 red-team suite as a Definition-of-Done gate.

## F. Roadmap Revision

- **Phase B-0 — Decisions & design gate (NEW, before any classifier code):** resolve F1 (confirmation trust model), F3 (signature granularity), F4/F7 (classification-as-UX framing), F5 (npx). Update design.md. *Why:* these are cheap to decide on paper and ruinous to retrofit after agents depend on the contract.
- **Phase A — Contain + Sanitize + parity (ship in v0.9.31, unchanged order):** env-scrub (with F2 smarter default + F8 flag), raw_output redaction (F6 length-hint), cwd confine, guardrail parity. *Why first:* highest value, no classifier dependency, no capability loss, closes the real secret-harvest surface. **Independently shippable.**
- **Phase B — Classifier + confirmation (after B-0):** implement per resolved decisions; hook path primary. *Why after A:* A delivers the security value; B is the friction-gradient UX on top.
- **Phase C — Optional sandbox (Linux/macOS):** unchanged; opt-in.
- **Phase D — Positioning/docs:** after A lands (claims must be true).

## G. Open Decisions Register

| Decision | Why it matters | Options | Recommended | Decide by |
|---|---|---|---|---|
| Confirmation transport | Determines if Amber is a real control | in-band / PreToolUse hook / both | Hook primary, in-band fallback | Before Phase B |
| Approval signature | Granularity = the security property | exact string / argv-hash / prefix | argv-hash + expiry | Before Phase B |
| Env default policy | Breakage vs containment | bare-min / secret-shaped-drop / full | secret-shaped-drop | Before Phase A |
| Classification role | Changes correctness definition | security control / UX gradient | UX gradient (state it) | Before Phase B |
| raw_output redaction FP handling | Debugging value | plain [REDACTED] / length-hint | length-hint | Before Phase A |

## H. Explicit Assumptions

| Assumption | Why needed | Risk if wrong |
|---|---|---|
| The host harness supports PreToolUse hooks (Claude Code does) | F1 primary mechanism | Hook-less harnesses get contained-but-unconfirmed Amber only |
| Most dev commands work under a secret-shaped-drop env | F2 default viability | More `--inherit-env` usage than expected → retune |
| Agents will pass the `confirm` signature faithfully in benign cases | Confirm-once UX | Only affects UX (benign case), not the security case |

## I. Dependency & Coordination Map

| Dependency | Type | Blocking for | Owner | Risk if unavailable |
|---|---|---|---|---|
| Harness PreToolUse hook API | system (Claude Code) | Phase B (F1) | external | Amber degrades to contained-unconfirmed |
| `bubblewrap`/`sandbox-exec` | vendor/OS | Phase C only | external | Sandbox mode unavailable on that OS (opt-in, non-blocking) |
| Existing `redact()`/`buildAllowlist()` | internal | Phase A/B | TracePulse | none (already present) |

## J. Do-Not-Miss Checklist

| Lens | Status | Findings |
|------|--------|----------|
| 1. Product Clarity & Scope | Reviewed — no issues | 0 |
| 2. User Journey & UX | Reviewed — 1 (Amber CUJ, F1-adjacent) | 1 |
| 3. Domain Model & Data | Reviewed — 1 (signature, F3) | 1 |
| 4. Security, Privacy, Abuse | Reviewed — 4 (F1,F4,F7,F9) | 4 |
| 5. API & Contract | Reviewed — 1 (contract change, in F8/E) | 1 |
| 6. Maintainability & Architecture | Reviewed — 1 (fleet reuse, F10) | 1 |
| 7. Observability & Debuggability | Reviewed — 1 (classifier metrics) | 1 |
| 8. Testing & Quality Gate | Reviewed — 1 (red-team suite, F9) | 1 |
| 9. Delivery, CI/CD, Release | Reviewed — 1 (rollout/flag, F8) | 1 |
| 10. Dependency/Vendor/Integration | Reviewed — 1 (sandbox OS, F10) | 1 |
| 11. Performance/Scalability/Cost | Reviewed — no issues | 0 |
| 12. AI/Agentic Feature Readiness | Reviewed — 2 (F1,F5) | 2 |
| 13. Regulatory/Legal/Compliance | Not applicable — local OSS tool, no customer/PII data | 0 |
| 14. Multi-Tenancy | Not applicable — single-user local process | 0 |
| 15. Business Continuity/DR | Not applicable — no service; local gitignored files | 0 |
| 16. i18n/L10n | Not applicable — developer CLI/agent tool, English diagnostics | 0 |
| 17. Commercial Model | Not applicable — OSS (positioning tracked in TRP-60) | 0 |
| 18. Support & Ops Readiness | Reviewed — 1 (env opt-out ergonomics, F2) | 1 |

---

## Verdict

**CONDITIONALLY READY.** Ship **Phase A** (Contain + Sanitize + parity) into v0.9.31 now — it is well-specified, high-value, and capability-neutral, after folding in F2 (smarter env default), F6 (length-hint redaction), F8 (rollout flag). **Gate Phase B** (classifier + confirmation) behind a short **Phase B-0 decisions pass** resolving F1 (confirmation trust model — hook primary), F3 (approval signature), F4/F7 (classification-as-UX), F5 (npx). Re-run this review after B-0 updates design.md.

---

## Resolution (2026-07-17)

Findings folded into the spec (Phase A now build-ready):
- **F2** → requirements F1 AC2-5 + design §5 (pass-through minus secret-shaped vars, not bare-minimum).
- **F6** → requirements F2 AC4-5 + design §5.1 (length-hint redaction + false-positive test).
- **F8** → requirements F1 AC5 + tasks A1 (feature flag, default-on, grace + CHANGELOG).
- **F9** → requirements NFR + tasks A5 (red-team/bypass suite as DoD gate).
- **F4/F7** → requirements F5 AC1 + design §3a (friction gradient, not a sandbox).
- **F10** → design §6 (Windows note) + §9 (cross-fleet reuse).

Recommended resolutions baked into design.md as the proposed Phase B-0 answers (still require sign-off before Phase B code):
- **F1** hook-primary (design §4), **F3** SHA-256-argv signature (design §4), **F5** npx target parsing (design §3).

Phase A (Features 1–4) is independent of Phase B and executable now.
