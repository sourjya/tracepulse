# TRP-82: Investigation-Episode Segmentation + Modality Tag — Proposal

**Date:** 2026-07-18 · **Ticket:** TRP-82 (child of TRP-73) · **Status:** Draft (awaiting approval)
**Depends on:** TRP-78 (audit-buffer middleware, merged), TRP-79 (FSM episode hooks, merged)

## Problem Statement

TracePulse's lifecycle FSM already segments each error fingerprint's life into
**episodes** (`src/store/lifecycle-fsm.ts` — `Episode` with `started_at`, `ended_at`,
`state`, `tool_calls`, `outcome`). But an episode records **no cost** beyond a raw
tool-call count and **no indication of how it was resolved**. Consequently:

- The product can say *"N episodes resolved"* but not *"a resolved episode costs ~X tool
  calls / ~Y seconds"* — so the only "savings" number it emits is the hardcoded `12×/3×`
  counterfactual in `get_session_impact`, which is an assumption, not a measurement
  (see `docs/research/telemetry-savings-measurement.md` §b–c).
- There is no way to compare episodes resolved **via TracePulse investigation tools**
  against those resolved **via the shell executor** (`run_and_watch`/`verify_*`), because
  no modality/arm is recorded anywhere in `src/` (grep confirms zero implementation).

This blocks the whole "honest savings" line of TRP-73: `get_effectiveness_report`
(TRP-84) already ships a `note` promising *"per-episode investigation-cost … pending
(TRP-82/TRP-83)"*, with a placeholder token field explicitly disclaimed as "not the
agent's investigation cost."

## Proposed Solution

Extend the **existing** episode rather than build a parallel system:

1. **Cost accounting on the episode** — keep the current `tool_calls` count; add
   per-episode TracePulse response-token volume (a labelled proxy) and surface the
   already-derivable wall-clock `duration_ms`.
2. **A modality (arm) tag** — classify each episode as `tp` (driven by TracePulse
   investigation tools), `shell` (driven by `run_and_watch`/`verify_*`), `mixed`, or
   `none`, from a single auditable tool→arm map.
3. **Attribution plumbing** — route the TRP-78 middleware's per-call tokens/duration into
   the active episode of the fingerprint the call references (deterministic; ambiguous
   calls are left unattributed, not smeared).
4. **An observational metric** — cost-**per-resolved-episode** as `{value, n, ci}` (mean
   CI), stratified by arm, surfaced through the existing `get_effectiveness_report`.
5. **Durable episode records** — a new `episode` journal entry so sample size grows
   across sessions.

Reuse: the `{value, n, ci}` shape and the Wilson helper already exist in
`effectiveness-report.ts`; a distinct **mean-CI** helper is added (means ≠ proportions).

### Honest boundaries (the point of this workstream)

- **Observational, not causal.** This reports what episodes cost as they happened; it is
  not a randomised control-arm comparison (that is TRP-85).
- **MCP-visible only.** TracePulse sees a call only when routed through its MCP server.
  The agent's raw `Bash cat/tail/grep` / `Read`-on-logfile — the "true" shell arm — is
  invisible; the only shell activity observed is `run_and_watch`. The arm tag therefore
  classifies episodes by *which MCP tools drove them*, and says so. Capturing the agent's
  own shell activity is TRP-83 (OTLP).
- **`tokens` = TracePulse's own estimated response volume**, not agent cost. It stays
  labelled a proxy until TRP-83 provides a real token denominator. The directly-observed
  headline metrics are **tool-calls-** and **wall-clock-time-per-episode**.

## Scope

### In scope
- Extend `Episode`/`MutableEpisode` with `arm` and `tp_response_tokens`.
- A single tool→arm classification map/predicate.
- Attribution of TRP-78 middleware per-call cost into the active episode.
- A mean-CI helper + `per_episode_cost` computation, stratified by arm.
- Extend `get_effectiveness_report` with the `per_episode_cost` block.
- A durable `episode` journal entry type + compaction aggregation (schema-versioned).

### Out of scope
- Capturing the agent's own shell/Read activity (TRP-83, OTLP).
- Real agent token/$ cost (TRP-83).
- Causal / randomised-holdout efficacy (TRP-85).
- Charts / visualisation (TRP-86, merged — consumes this data).
- Per-agent stratification (later refinement).

## Success Criteria
- `get_effectiveness_report` returns a `per_episode_cost` block with real `{value, n,
  ci}` for `tool_calls`, `duration_ms`, and `tp_response_tokens` over resolved episodes,
  overall and split by arm — populated from actual session activity, provenance-labelled.
- No regression to existing report fields or to the parse/score/watch hot path.
- Episode records persist and the report's `n` grows across sessions.
