# TRP-82: Investigation-Episode Segmentation + Modality Tag — Requirements

**Date:** 2026-07-18
**Status:** Draft (awaiting approval)
**Ticket:** TRP-82 (child of TRP-73)
**Depends on:** TRP-78 (audit-buffer middleware, merged), TRP-79 (FSM episode hooks wired, merged)
**Source:** `docs/research/telemetry-savings-measurement.md` §(d) item 5

## Overview

TracePulse's lifecycle FSM already segments each error fingerprint's life into
**episodes** (`src/store/lifecycle-fsm.ts` — `Episode` with `started_at`, `ended_at`,
`state`, `tool_calls`, `outcome`). What it does **not** do is record *how much an episode
cost* or *by what means it was resolved*. This spec extends the existing episode with
cost accounting and a modality (arm) tag, then reports **cost-per-resolved-episode as
`{value, n, ci}`, stratified by arm** — the first *observational* per-episode metric,
replacing the hardcoded `12×/3×` point multiplier with something measured.

See `proposal.md` for problem statement, solution shape, and scope.

### Key invariants
- **Honest provenance.** Observational, not causal (causal = TRP-85). Every number
  carries a `provenance` label and a clarifying `note`.
- **MCP-visible only.** TracePulse sees a call only when routed through its MCP server;
  the agent's raw `Bash`/`Read`-on-logfile shell activity is invisible. The arm tag
  classifies episodes by *which MCP tools drove them* (TRP-83 captures the rest).
- **`tokens` = TracePulse's own estimated response volume**, a labelled proxy, not agent
  cost. Directly-observed headline metrics are tool-calls- and time-per-episode.
- **No new hot-path cost.** O(1) in-memory attribution on the already-instrumented audit
  path (TRP-78). No new daemon or always-on surface.
- **Backward compatible.** New `Episode` fields are additive; existing metrics/report
  fields unchanged, only extended.

## Glossary

| Term | Meaning |
|------|---------|
| **Investigation episode** | One pass of a fingerprint through the FSM from `surfaced` to a terminal outcome. Modelled as `Episode` in `lifecycle-fsm.ts`. |
| **Resolved episode** | `outcome === "resolved"` (confirmed fix). The headline denominator. |
| **Arm / modality** | The class of tool(s) that drove an episode: `tp`, `shell`, `mixed`, `none`. |
| **tp-arm tool** | A TracePulse investigation tool (`get_error_context`, `get_prompt_context`, `acknowledge_error`, …). |
| **shell-arm tool** | A child-process tool: `run_and_watch`, `verify_build`, `verify_fix`, `verify_loop`, `start_server`, `restart_server`, `stop_server`. (Shell-arm even when fingerprint-bearing, e.g. `verify_fix`.) |
| **Two axes** | *Arm* (how an episode was driven) and *token-attribution eligibility* (whose response tokens we add) are independent: `verify_fix` is shell-arm but not a token-attribution tool. |
| **Attribution** | Adding a tool call's cost (count/arm always; tokens only for tp-arm read tools) to the active episode of the fingerprint it references. |
| **`{value, n, ci}`** | A measured quantity with sample size + 95% CI. Reuses the `RateWithCI` shape from `effectiveness-report.ts`, generalised for means. |

---

### REQ-1: Episodes carry cost and a modality tag

**User Story:** As a developer evaluating TracePulse, I want each investigation episode to
record what it cost and how it was driven, so that per-episode effectiveness can be
measured instead of assumed.

**Acceptance Criteria:**
- [ ] WHEN an episode is started (`startEpisode`) THEN the system SHALL initialise its
  cost accumulators to zero (`tp_response_tokens = 0`, tool-call count = 0) and its `arm`
  to `none`.
- [ ] WHEN a tool call is attributed to a fingerprint with an active episode THEN the
  system SHALL increment that episode's tool-call count (existing behaviour, preserved)
  AND add the call's estimated `response_tokens` to the episode's running total.
- [ ] WHEN an attributed tool call belongs to the **tp-arm** set AND the episode's arm is
  `none` THEN the system SHALL set the arm to `tp`; WHEN it belongs to the **shell-arm**
  set AND the arm is `none` THEN set it to `shell`.
- [ ] IF an episode has seen a tool from one arm AND a tool from the other arm is
  attributed THEN the system SHALL set the arm to `mixed`.
- [ ] IF an attributed tool belongs to neither arm set THEN the system SHALL leave the arm
  unchanged (neutral tools do not set modality).
- [ ] WHEN an episode enters `edit_observed` THEN the system SHALL record
  `edit_observed_at` on the episode (needed for the effort metric in REQ-3; excludes the
  auto-suppress resolution-window timer that otherwise dominates terminal duration).
- [ ] WHEN an episode ends (`endEpisode`) THEN its cost fields, `arm`, and
  `edit_observed_at` SHALL be frozen into the immutable episode-history copy alongside the
  existing fields.
- [ ] The system SHALL expose two derived durations for completed episodes:
  `time_to_edit_ms = edit_observed_at - started_at` (the **effort** proxy) and
  `total_wall_clock_ms = ended_at - started_at` (labelled "incl. resolution window; not
  effort").

---

### REQ-2: Token/duration attribution plumbing

**User Story:** As a maintainer, I want tool-call cost routed to the right episode
deterministically, so that per-episode numbers reflect real attribution and never guess.

**Acceptance Criteria:**
- [ ] **Two independent axes.** *Arm* (how the episode was driven: tp vs shell) and
  *token-attribution eligibility* (whose response tokens we add to the episode) are
  SEPARATE. `verify_fix`/`verify_*` are **shell-arm** (they run a command) even though they
  carry a fingerprint; they are NOT token-attribution tools.
- [ ] WHEN an instrumented tool call completes (TRP-78 middleware) AND it is a
  fingerprint-bearing tp-arm **read** tool (`get_error_context`, `get_prompt_context`,
  `acknowledge_error`) AND its resolvable `fingerprint` has an active episode THEN the
  system SHALL add the call's estimated `response_tokens` to that episode.
- [ ] IF a completed tool call carries **no** resolvable fingerprint (`get_errors`,
  `get_session_insights`) THEN the system SHALL NOT attribute its cost to any single
  episode (ambiguous cost is session overhead, never smeared).
- [ ] WHEN a `run_and_watch`/`verify_*` call resolves to fingerprints via the existing
  command→fingerprint mapping (`onCommandRun`) THEN the system SHALL attribute its cost to
  each such fingerprint's active episode and mark those episodes shell-arm.
- [ ] The attribution path SHALL be best-effort and MUST NOT throw into or slow a tool
  call (mirrors TRP-78: telemetry never breaks a tool call).
- [ ] The tool→arm classification SHALL live in one place (a single map/predicate),
  auditable and testable in isolation.

---

### REQ-3: Per-episode cost metric as `{value, n, ci}`, stratified by arm

**User Story:** As an AI coding agent (and a developer), I want the measured cost of a
resolved episode with its sample size and confidence interval, split by how it was
resolved, so I can report honest value instead of a made-up multiplier.

**Acceptance Criteria:**
- [ ] The system SHALL compute, over **completed resolved** episodes: `time_to_edit_ms`
  (effort proxy — `edit_observed_at − started_at`, excludes the resolution-window timer),
  `tool_calls` (observed count), and `tp_response_tokens` (labelled proxy). It SHALL NOT
  emit a separate total-wall-clock mean: that equals the report's existing
  `mean_time_to_fix_ms` and MUST NOT be re-reported under a second name (F5).
- [ ] Each metric SHALL be returned as `{ value, n, ci_low, ci_high }` where `value` is the
  sample **mean**, `n` the resolved-episode count, and `ci` a **95% mean CI** using the
  **t-critical** value `t(0.975, n−1)` for `n < 30` (not a fixed 1.96), because per-repo
  samples are small and right-skewed (F4).
- [ ] IF `n < 2` THEN the system SHALL return the mean (or 0 for `n = 0`) with
  `ci_low = ci_high = value` and MUST NOT fabricate a spread; IF `n < 5` THEN the block
  SHALL carry `low_confidence: true`.
- [ ] The system SHALL stratify **`time_to_edit_ms` and `tool_calls` by arm** (`tp`,
  `shell`, `mixed` — **disjoint** buckets; `mixed` is its own bucket, not summed into the
  others), each with its own `{value, n, ci}`. It SHALL **NOT** stratify
  `tp_response_tokens` by arm: shell-arm episodes receive ~0 token attribution by design,
  so a by-arm token comparison would be a method artifact (F1). `tp_response_tokens` is
  reported **overall only**, explicitly tp-weighted.
- [ ] Every returned block SHALL carry `provenance: "observational (no control arm)"` and a
  `note` clarifying that (a) `tp_response_tokens` is TracePulse's own volume (not agent
  cost) and is tp-weighted, (b) `time_to_edit_ms` is the effort proxy and the existing
  `mean_time_to_fix_ms` (terminal, incl. the resolution window) is NOT effort, and (c) the
  arm split reflects MCP-visible tools only.
- [ ] The proportion helper (`wilsonInterval`/`rateWithCI`) SHALL NOT be misused for these
  means; a distinct mean-CI helper SHALL be added and unit-tested against known inputs.

---

### REQ-4: Surface the metric through `get_effectiveness_report`

**User Story:** As an agent, I want the per-episode cost breakdown in the existing
effectiveness report, so I don't need a new tool to see it.

**Acceptance Criteria:**
- [ ] The system SHALL extend `EffectivenessReport` with a `per_episode_cost` block
  carrying the overall and per-arm metrics from REQ-3. (The report's existing note already
  promises this.)
- [ ] Existing `EffectivenessReport` fields (rates, counts, `mean_time_to_fix_ms`,
  `tp_response_tokens_total`) SHALL remain unchanged and correctly populated.
- [ ] WHEN there are zero resolved episodes THEN `per_episode_cost` SHALL report `n = 0`
  metrics with a `note` that data is still accumulating (no error, no fabricated value).
- [ ] The extended report SHALL remain read-only and side-effect-free.

---

### REQ-5: Durable episode records (cross-session)

**User Story:** As a developer, I want per-episode metrics to survive across sessions, so
the report's sample size grows over time rather than resetting each run.

**Acceptance Criteria:**
- [ ] WHEN an episode ends THEN the system SHALL emit a durable episode record to the
  event journal carrying `{ fingerprint, started_at, ended_at, outcome, tool_calls, arm,
  tp_response_tokens }`.
- [ ] The journal compaction (`compactJournal`) SHALL aggregate persisted episodes so
  `get_effectiveness_report` can compute REQ-3 metrics across the retained session window.
- [ ] Persistence SHALL be additive to the telemetry schema and MUST NOT break readers of
  the current `.tracepulse/telemetry.json` (schema-version bump with a documented
  back-compat path).
- [ ] No PII, no log content, no network — only counters, timestamps, outcome, and arm.

---

## Non-Functional Requirements

- **NFR-1 (hot path).** Attribution adds O(1) in-memory work per already-instrumented tool
  call; zero additional work on the parse/score/watch loop. No new process/server/daemon.
- **NFR-2 (statistical honesty).** Means use a mean CI; proportions keep Wilson. `n<2`
  yields no fabricated spread. Provenance labels mandatory on every emitted metric.
- **NFR-3 (resilience).** Attribution and journaling are best-effort; a failure never
  breaks or slows a tool call or an FSM transition.
- **NFR-4 (privacy).** Local-only, no PII, no log content.
- **NFR-5 (report size).** Extended `get_effectiveness_report` payload stays compact
  (target < 600 tokens).

## Out of Scope

- Capturing the agent's own shell/Read activity (TRP-83, OTLP).
- Real agent token/$ cost (TRP-83).
- Causal / randomised-holdout efficacy (TRP-85).
- Charts / visualisation (TRP-86, merged — consumes this data).
- Per-agent stratification (later refinement).

## Phasing

- **Phase A — Episode cost + modality (in-memory).** Extend `Episode`/`MutableEpisode`
  with `arm` + `tp_response_tokens`; add the tool→arm map; attribute on `recordToolCall`.
  (REQ-1, REQ-2)
- **Phase B — Attribution wiring.** Route TRP-78 middleware per-call tokens/duration +
  resolved fingerprint into the FSM attribution entry point. (REQ-2)
- **Phase C — Metric + report surface.** Add the mean-CI helper + `per_episode_cost`
  computation; extend `get_effectiveness_report`. (REQ-3, REQ-4)
- **Phase D — Persistence.** Add the `episode` journal entry type + compaction; version
  the telemetry schema with back-compat. (REQ-5)

Phases A–C are one shippable PR (the live in-session metric). Phase D is a second PR
(durability) so the schema change lands and is reviewed on its own.
