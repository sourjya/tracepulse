# TRP-82 Spec — Readiness Review (`review-spec-readiness` gate)

**Reviewer role:** principal product/software/security/API/delivery architect (multi-lens).
**Date:** 2026-07-18 · **Spec:** `telemetry-episode-segmentation` (proposal + requirements + design + tasks).
**Calibration:** Local, single-user, no-network, no-PII dev-tool telemetry extension to an
existing subsystem. Lenses for multi-tenancy, compliance, DR, i18n, commercial model,
support-ops are **Not Applicable** and marked so — reviewing them would be ceremony, not risk
reduction. Depth concentrated on: scope integrity, domain/state model, statistical honesty
(this is an *honesty* workstream), maintainability, observability, testing, and the
agent-facing contract.

---

## A. Executive Summary

1. **Input maturity tier:** **Tier 2 — Draft Spec** (structured, four files, REQ-tagged AC,
   design with sequences + reuse ledger; a couple of design contradictions remain).
2. **Build-readiness verdict:** **CONDITIONALLY READY.** Three must-resolve findings, all in
   *metric definition* — fix them in the spec (not in code) and this is ready to plan build.
3. **Explanation.** The plumbing design is sound and reuses existing machinery well. But the
   spec's headline outputs are two metrics that, as currently defined, would be **misleading** —
   which is disqualifying for a workstream whose entire purpose is honest numbers. (a) The
   single most dangerous assumption: that `tp_response_tokens` split *by arm* is comparable —
   it is not, because shell-arm episodes get ~0 token attribution *by design*, so shell will
   always look cheaper as an artifact of the method (F1). (b) The highest-cost gap:
   `duration_ms` for a **resolved** episode is dominated by the fixed `RESOLUTION_WINDOW_MS`
   timer (the path to `resolved` runs through the auto-suppress timer), so "time per resolved
   episode" is mostly a constant, not effort (F2). Both are cheap to fix now (metric
   redefinition) and expensive to discover after shipping a chart built on them (TRP-86).
4. **Top 3 strengths:** (1) Honest scope boundary — "MCP-visible only," tokens-as-proxy — is
   stated up front, not buried. (2) Reuses the existing `Episode`, middleware, and report
   rather than building parallel infra. (3) Clean attribution-by-availability split (hook layer
   owns arm+count, middleware owns tokens) avoids double-counting with a single count-writer.
5. **Top gaps (ranked by fix-cost-now vs later × rework probability):**
   1. F1 — token-by-arm comparison is a method artifact (High; cheap now, misleading forever).
   2. F2 — resolved-episode duration ≈ resolution-window constant (High; cheap now).
   3. F3 — `verify_fix` classified as both tp-arm and shell-arm (contradiction) (High; trivial).
   4. F4 — small-n normal-approx CI on skewed data overstates precision (Medium).
   5. F5 — `duration_ms.overall` (resolved) duplicates existing `mean_time_to_fix_ms` (Medium).
   6. F6 — episode lost when `get_error_context` is called on a never-surfaced fingerprint (Low).
   7. F7 — Phase-D v1→v2 back-compat/compaction-rewrite behavior under-specified (Low).
   8. F8 — `by_arm.mixed` bucket disjointness not stated (Low, clarity).
6. **Roadmap sequencing changes:** (1) Keep Phase D (persistence/schema bump) as a *separate
   PR* — already planned, good; do not fold into PR 1. (2) Add a "metric-definition freeze"
   sub-step at the top of Phase C so the F1/F2 redefinitions are settled before the report
   surface is coded. (3) TRP-86's chart of this data must not be revisited until F1/F2 land, or
   it will visualize the misleading version.
7. **Biggest future-regret risk:** shipping the per-arm token comparison into the TRP-86
   dashboard, then having a user cite "shell is cheaper than TracePulse" from what is purely an
   attribution artifact — the exact credibility hit this workstream exists to prevent.
8. **First 3 decisions before other work:** (D1) Redefine the effort metric to
   `time_to_edit_ms` (surfaced→edit_observed), not terminal duration (F2). (D2) Decide token
   reporting: overall-only + proxy caveat, not by-arm (F1). (D3) Fix `verify_fix`'s single arm
   (F3).

## B. Spec Readiness Scorecard

| Area | Score | One-line note |
|------|-------|---------------|
| Problem framing | Strong | Clear, tied to TRP-73 research + the existing report stub. |
| User/persona clarity | Adequate | Two consumers (agent, developer); fine for internal tool. |
| CUJs/workflows | Adequate | Sequences given for tp/shell/report paths. |
| Scope/non-goals | Strong | Explicit out-of-scope → TRP-83/85/86. |
| Domain model | Adequate | Episode extension well-defined; arm axis vs token-attribution axis conflated (F3). |
| State/lifecycle | Weak | Resolved-path duration semantics not reckoned with (F2). |
| Security model | N/A→Adequate | Local, no auth surface; STRIDE below finds nothing material. |
| Access control model | N/A | No roles/actors; single local user. |
| Threat model | Adequate | Manual STRIDE done (Lens 4); no material threat. |
| Privacy/data | Strong | No PII/log content invariant carried forward. |
| API/contract | Adequate | Report shape defined; token-by-arm field is the risk (F1). |
| Architecture maintainability | Strong | Single arm map, single count-writer, reuse ledger. |
| Observability | Adequate | It *is* the observability feature; best-effort discipline stated. |
| Testing strategy | Strong | RED/GREEN per task, unit+integration, negative cases. |
| CI/CD/release | Adequate | Two-PR split; ship-pr + code-review cited. |
| Dependency risk | Strong | No new external deps. |
| Performance/cost | Adequate | O(1) attribution; `getAllEpisodes` bounded (F6 note). |
| AI/agent controls | Weak→(fixed) | Provenance labels good, but F1/F2 would feed an agent misleading numbers. |
| Regulatory/compliance | N/A | Local dev tool, no regulated data. |
| Multi-tenancy | N/A | Single-user local. |
| Business continuity/DR | N/A | Telemetry is best-effort, loss-tolerant by design. |
| i18n/L10n | N/A | Machine-readable JSON; no user-facing locale strings. |
| Commercial model | N/A | OSS dev tool. |
| Support/ops readiness | N/A | No support surface. |
| Roadmap sequencing | Strong | Phasing + dependencies explicit. |

## C. High-Priority Findings

### F1 — Per-arm token comparison is a method artifact (must resolve)
- **Severity:** High · **Category:** Lens 12 (AI/agent honesty) + Lens 5 (contract).
- **Scope:** REQ-3 AC4, design `EpisodeCostBlock.by_arm.*.tp_response_tokens`.
- **Evidence:** design "Shell-arm token attribution is intentionally not done here … so
  `tp_response_tokens` is thus tp-weighted." REQ-3 AC4 still reports `tp_response_tokens` per arm.
- **Why it matters:** shell-arm episodes structurally receive ~0 tokens, so a by-arm token
  comparison encodes the attribution gap as a fake "shell is cheaper" signal.
- **If ignored:** an agent or the TRP-86 chart reports a misleading cross-arm token delta.
- **Rework if late:** Medium (weeks — chart + any cited numbers must be retracted).
- **Spec upgrade:** report `tp_response_tokens` **overall only**, explicitly tp-weighted, with a
  caveat; do **not** stratify it by arm. Keep `tool_calls` and the effort-duration by arm (those
  *are* cleanly attributed across arms). Add to REQ-3 + design.
- **Decision urgency:** Must decide now.

### F2 — Resolved-episode `duration_ms` is dominated by the resolution-window timer (must resolve)
- **Severity:** High · **Category:** Lens 3 (state/lifecycle) + Lens 12.
- **Scope:** REQ-3 AC1 `duration_ms_per_episode`, design duration semantics.
- **Evidence:** FSM path to `resolved` is `edit_observed —(RESOLUTION_WINDOW_MS timer)→ suppressed
  —re_exercised_absent→ resolved` (`lifecycle-fsm.ts` timer at `:182-192`). So `ended_at -
  started_at` ⊇ the fixed window.
- **Why it matters:** "time per resolved episode" is then ~constant + noise, not investigation
  effort — worthless as an efficiency metric and easy to misread as one.
- **If ignored:** the headline time metric is meaningless yet presented as measured effort.
- **Rework if late:** Low–Medium.
- **Spec upgrade:** make the **effort** metric `time_to_edit_ms = edit_observed_at −
  started_at` (surfaced→first fix signal), which excludes the timer; keep terminal
  `duration_ms` only as a labelled "total wall-clock incl. resolution window," not the headline.
  Requires recording `edit_observed_at` on the episode. Update REQ-1/REQ-3/design.
- **Decision urgency:** Must decide now.

### F3 — `verify_fix` classified as both tp-arm and shell-arm (must resolve)
- **Severity:** High (contradiction) · **Category:** Lens 3/6.
- **Scope:** REQ-2 AC1 lists `verify_fix` among tp-arm token-attribution tools; glossary +
  design `SHELL_ARM_TOOLS` include `verify_fix`.
- **Why it matters:** an ambiguous arm makes the modality tag non-deterministic and untestable.
- **Spec upgrade:** two separate axes — **arm** (`verify_fix` runs a command ⇒ **shell-arm**)
  and **token-attribution eligibility** (only `get_error_context`/`get_prompt_context`/
  `acknowledge_error` are fingerprint-bearing *read* tools whose response tokens we attribute).
  Remove `verify_fix` from REQ-2 AC1's attribution list; keep it shell-arm. State the two axes
  are independent.
- **Decision urgency:** Must decide now.

### F4 — Small-n normal-approx CI overstates precision on skewed data (should resolve)
- **Severity:** Medium · **Category:** Lens 8/11.
- **Evidence:** episodes capped (`MAX_EPISODES_PER_FP=10`, `MAX_TELEMETRY_SESSIONS=50`); n will
  often be 2–5. `mean ± 1.96·sd/√n` assumes normality/large n; token/duration are right-skewed.
- **Spec upgrade:** use the **t-critical** value for `n<30` (df=n−1) instead of a fixed 1.96,
  and add a `note`/flag when `n<5` that the interval is indicative only. Cheap; keeps honesty.
- **Decision urgency:** Before MVP (fold into Phase C).

### F5 — `duration_ms.overall` (resolved) duplicates existing `mean_time_to_fix_ms` (should resolve)
- **Severity:** Medium · **Category:** Lens 6.
- **Spec upgrade:** don't emit two names for the same quantity. Keep `mean_time_to_fix_ms` as-is;
  the new per-episode block leads with `time_to_edit_ms` (F2) and references (not re-derives)
  time-to-fix. State the relationship in design.
- **Decision urgency:** Before MVP.

### F6 / F7 / F8 — Low (defer with a note)
- **F6:** `get_error_context` on a never-surfaced fingerprint → no active episode → cost lost.
  Accept as a documented limitation (agents normally surface first); note in design.
- **F7:** Phase-D: state explicitly that compaction rewrites the file to v2 and v1 files load
  with `episodes: []`. One sentence in design.
- **F8:** State that `by_arm` buckets are **disjoint** (`mixed` is its own bucket, not summed
  into `tp`/`shell`). One sentence.

## D. Predicted Issues to Avoid

| Likely future problem | Why this spec permits it | Cost if late | Prevention now |
|---|---|---|---|
| "Shell cheaper than TP" false claim | by-arm token artifact (F1) | Medium | Overall-only tokens + caveat |
| Time metric is a constant | timer-dominated duration (F2) | Low–Med | `time_to_edit_ms` |
| Non-deterministic arm in tests | `verify_fix` dual arm (F3) | Low | One arm, two axes |
| Over-tight CIs cited as fact | normal approx, tiny n (F4) | Low | t-value + low-n flag |

## E. Strengthened Spec Additions (drafted)
- **Metric definitions (add to design):** `time_to_edit_ms = edit_observed_at − started_at`
  (effort proxy; excludes resolution window). `total_wall_clock_ms = ended_at − started_at`
  (labelled "incl. resolution window; not effort"). `tool_calls` (observed count).
  `tp_response_tokens` (overall only; tp-weighted proxy). By-arm reporting applies to
  `time_to_edit_ms` and `tool_calls` **only**.
- **Stats (add to design):** `meanWithCI` uses t-critical `t(0.975, n−1)` for `n<30`; `n<2`→no
  spread; `n<5`→`low_confidence: true`.
- **Episode field (REQ-1):** record `edit_observed_at?` when the episode enters `edit_observed`.

## F. Roadmap Revision (calibrated — this is one small feature, not a program)
- **Phase 0 (decisions):** resolve F1–F3 in the spec (this review). No code. Threat model:
  manual STRIDE below suffices; a full `threat-modeling-mcp-server` run is **disproportionate**
  for a local no-network no-PII counter feature — offered, not required.
- **Phase 1 (thin slice) = Phase A–B:** arm map + episode fields + attribution, unit-tested.
- **Phase 2 (core) = Phase C:** metrics (with F1/F2/F4 definitions) + report surface.
- **Phase 3 (hardening) = Phase D:** persistence + schema bump, separate PR (isolates the
  migration risk — the one place this feature can break existing readers).
- Sequencing rationale: settle metric semantics before the report is coded, so TRP-86's chart is
  never built on the misleading version.

## G. Open Decisions Register
| Decision | Why it matters | Options | Recommended | Decide by |
|---|---|---|---|---|
| Token reporting granularity | avoid artifact (F1) | by-arm / overall-only | Overall-only + caveat | Now |
| Effort-time definition | avoid timer constant (F2) | terminal dur / time-to-edit | time-to-edit | Now |
| `verify_fix` arm | determinism (F3) | tp / shell | shell | Now |
| CI method | small-n honesty (F4) | 1.96 / t-value | t-value + low-n flag | Phase C |
| Schema bump vs new file | Phase-D compat (F7) | version bump / sidecar | version bump, load v1 empty | Phase D |

## H. Explicit Assumptions
| Assumption | Why needed | Risk if wrong |
|---|---|---|
| Agents surface (`get_errors`) before investigating a fingerprint | attribution needs an active episode | F6 — occasional lost attribution; low |
| `response_tokens` (chars/4) is an acceptable proxy | no real token count until TRP-83 | Over/under-counts; disclosed as proxy |
| Episode caps (10/fp, 50 sessions) are adequate sample | statistical validity | Wide CIs; mitigated by F4 low-n flag |

## I. Dependency and Coordination Map
| Dependency | Type | Blocking for | Owner | Risk |
|---|---|---|---|---|
| TRP-78 middleware | system (merged) | Phase B | self | none |
| TRP-79 FSM hooks | system (merged) | Phase A/B | self | none |
| TRP-86 chart consumer | system (merged) | post-Phase C | self | must not chart pre-F1/F2 data |
| TRP-83 OTLP (real tokens) | system (future) | none (this ships proxy) | self | none — decoupled |

## J. Do-Not-Miss Checklist
| Lens | Status | Findings |
|---|---|---|
| 1. Product Clarity & Scope | Reviewed — no issues | 0 |
| 2. User Journey/UX | Reviewed — no issues (agent+dev consumers) | 0 |
| 3. Domain Model & Data | Reviewed — findings raised | F2, F3 |
| 4. Security/Privacy/Abuse | Reviewed — STRIDE done, no material threat | 0 |
| 5. API & Contract | Reviewed — findings raised | F1 |
| 6. Maintainability/Architecture | Reviewed — findings raised | F5 |
| 7. Observability/Debuggability | Reviewed — no issues (best-effort stated) | 0 |
| 8. Testing Strategy | Reviewed — no issues | 0 |
| 9. Delivery/CI/CD | Reviewed — no issues (two-PR split) | 0 |
| 10. Dependency/Vendor | Reviewed — no issues (no new deps) | 0 |
| 11. Performance/Cost | Reviewed — findings raised | F4 (stats), F6 note |
| 12. AI/Agent Readiness | Reviewed — findings raised | F1, F2 |
| 13. Regulatory/Compliance | Not applicable — local dev tool, no regulated data | — |
| 14. Multi-Tenancy | Not applicable — single-user local | — |
| 15. BC/DR | Not applicable — telemetry is loss-tolerant by design | — |
| 16. i18n/L10n | Not applicable — machine-readable JSON only | — |
| 17. Commercial Model | Not applicable — OSS dev tool | — |
| 18. Support/Ops | Not applicable — no support surface | — |

### Manual STRIDE (Lens 4, proportionate)
Trust model: a single local process reading/writing `.tracepulse/telemetry.json`; input is the
dev's own log stream (already trusted by the whole product) plus MCP tool params.
- **Spoofing / Elevation:** no auth surface, no roles — N/A.
- **Tampering:** a local actor could edit `telemetry.json`; same trust level as the source code —
  no new exposure.
- **Repudiation:** telemetry is advisory, not an audit-of-record — acceptable.
- **Information Disclosure:** new fields are counters/timestamps/`arm`/fingerprint (already
  stored). No new PII or log content. Invariant NFR-4 holds — **verify in code review** that
  `arm`/token fields never carry message text.
- **DoS:** attribution is O(1), episode/session caps bound memory and file size — no unbounded
  growth. `getAllEpisodes` bounded (≤500 episodes). No new DoS surface.
**Conclusion:** no material threat; one code-review check (no message text in new fields).

---

## Verdict & Disposition
**CONDITIONALLY READY** — proceed to implement **after** applying F1, F2, F3 to the spec
(must-resolve) and folding F4/F5 into Phase C, F6–F8 as one-line notes. Dispositions applied to
`requirements.md`/`design.md`/`tasks.md` in the same change; recorded on TRP-82.
