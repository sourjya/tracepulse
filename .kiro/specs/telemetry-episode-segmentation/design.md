# TRP-82: Investigation-Episode Segmentation + Modality Tag — Design

**Date:** 2026-07-18 · **Ticket:** TRP-82 · **Status:** Draft (awaiting approval)
Satisfies: REQ-1..REQ-5 in `requirements.md`.

## Overview

Extend the existing lifecycle-FSM `Episode` with a modality (`arm`) tag and cost
accounting, attribute per-call cost to the active episode at the point where the
fingerprint↔episode link is known, compute a mean-CI per-resolved-episode metric
stratified by arm, and surface it through `get_effectiveness_report`. Phase D persists
episodes so the metric's `n` grows across sessions.

Nothing here is greenfield infrastructure — it rides the FSM (TRP-79), the audit-buffer
middleware (TRP-78), and the effectiveness report (TRP-84) that already exist.

## Architecture

### Where attribution happens (the key decision)

A tool call has three cost signals with **different points of availability**:

| Signal | Known when | Clean per-episode attribution? |
|--------|-----------|-------------------------------|
| `arm` (tp/shell) | at the hook (which hook fired ⇒ which arm) | **Yes** — deterministic |
| `tool_calls` count | at the hook (fingerprint known) | **Yes** |
| `time_to_edit_ms` (effort) | at the `edit_observed` transition (`edit_observed_at - started_at`) | **Yes** — excludes resolution-window timer (F2) |
| `tp_response_tokens` | only **after** the handler returns, in the TRP-78 middleware (result size) | **Partial** — proxy, tp-arm read tools only |

> **F2:** terminal `ended_at - started_at` runs *through* the auto-suppress
> `RESOLUTION_WINDOW_MS` timer, so it is dominated by that constant and is **not** an effort
> metric. The effort proxy is `time_to_edit_ms` (surfaced→first fix signal). The terminal
> duration is already surfaced as the report's existing `mean_time_to_fix_ms` — not
> re-emitted here (F5).

Therefore attribution is **split by availability**, not forced through one choke point:

- **Hook layer (`lifecycle-hooks.ts`)** owns `arm` + `tool_calls`. This is deterministic
  and covers shell-arm episodes that *end during the handler* (which the post-result
  middleware would miss):
  - `onErrorInvestigated(fp)` — already fires for the three tp-arm tools
    (`get_error_context`, `get_prompt_context`, `acknowledge_error`). It already calls
    `recordToolCall`; we extend that call to also stamp `arm = tp`.
  - `onCommandRun(command, fps)` — the only shell-arm signal the server sees. Before any
    terminal transition it fires, we stamp `arm = shell` and increment `tool_calls` on
    each matched **active** episode, *then* let the existing resolve/recur diff logic run.
    Stamping before the transition guarantees the arm is frozen into the ended episode.
- **Middleware layer (`tool-telemetry.ts`, TRP-78)** adds `tp_response_tokens` best-effort:
  after the handler resolves, if `isTokenAttributable(tool)` (the three read tools) and
  `args[0].fingerprint` still has an active episode, it adds the estimated `response_tokens`
  to the episode. Ambiguous calls (`get_errors`, no fingerprint) attribute nothing (REQ-2
  AC2). Shell-arm token attribution is intentionally not done (episode may be terminal, and
  `verify_fix` is shell-arm, not token-attributable — F3); `tp_response_tokens` is thus
  tp-weighted, **reported overall-only and labelled a proxy** (F1) — honest, because TRP-83
  replaces the token denominator wholesale.

This split means `tool_calls` and `time_to_edit_ms` — the **directly observed headline
metrics** — are fully and cleanly attributed for every arm; `tp_response_tokens` is the
disclosed proxy (overall-only, F1).

### Module structure

```
src/store/tool-arms.ts          NEW  — single source of truth for the two axes (F3)
  export type Arm = "tp" | "shell" | "mixed" | "none";
  // Axis 1 — arm classification:
  export const TP_ARM_TOOLS: ReadonlySet<string>      // read/investigate: get_error_context, get_prompt_context, acknowledge_error, get_error_clusters, get_correlated_errors, ...
  export const SHELL_ARM_TOOLS: ReadonlySet<string>   // run a command: run_and_watch, verify_build, verify_fix, verify_loop, start_server, restart_server, stop_server
  export function classifyArm(tool: string): "tp" | "shell" | null
  export function mergeArm(current: Arm, next: "tp" | "shell"): Arm   // none→x; x→x; tp+shell→mixed
  // Axis 2 — token-attribution eligibility (independent of arm; verify_fix is shell-arm and NOT here):
  export const TOKEN_ATTRIB_TOOLS: ReadonlySet<string>  // {get_error_context, get_prompt_context, acknowledge_error}
  export function isTokenAttributable(tool: string): boolean

src/store/lifecycle-fsm.ts      EDIT — Episode/MutableEpisode gain `arm` + `tp_response_tokens`;
                                       startEpisode inits them; recordToolCall(fp, arm?) stamps arm;
                                       new attributeTokens(fp, tokens); new getAllEpisodes() accessor.
src/store/lifecycle-hooks.ts    EDIT — onErrorInvestigated stamps arm=tp; onCommandRun stamps arm=shell + counts.
src/mcp/tool-telemetry.ts       EDIT — after result, best-effort attributeTokens(fp, response_tokens) for tp-arm fp-bearing calls.

src/analysis/episode-cost.ts    NEW  — meanWithCI() + computePerEpisodeCost(episodes) → overall + per-arm blocks.
src/analysis/effectiveness-report.ts  EDIT — EffectivenessReport gains `per_episode_cost`; computeEffectivenessReport takes episodes.
src/tools/get-effectiveness-report.ts EDIT — gather fsm.getAllEpisodes(), pass into the report.

# Phase D (second PR)
src/persistence/journal-types.ts EDIT — add "episode" entry type + EpisodeEntryData; schema version bump.
src/persistence/journal-bridge.ts EDIT — journalEpisode(); FSM injected onEpisodeEnd sink calls it.
src/persistence/event-journal.ts EDIT — compactJournal aggregates episodes into TelemetrySummary.
src/store/lifecycle-fsm.ts       EDIT — endEpisode invokes optional injected onEpisodeEnd(episode) sink.
```

## Data model

### Extended `Episode` (REQ-1)
```ts
export interface Episode {
  readonly fingerprint: string;
  readonly started_at: number;
  readonly ended_at?: number;
  readonly state: LifecycleState;
  readonly tool_calls: number;
  readonly outcome?: "suppressed" | "resolved" | "recurred";
  readonly arm: Arm;                    // NEW — default "none"
  readonly tp_response_tokens: number;  // NEW — default 0 (labelled proxy)
  readonly edit_observed_at?: number;   // NEW — set on the edit_observed transition (F2 effort metric)
}
```
`MutableEpisode` mirrors these. `time_to_edit_ms` is derived
(`edit_observed_at - started_at`, the effort proxy); terminal `ended_at - started_at` is
NOT re-emitted (it equals the report's `mean_time_to_fix_ms`, F5). All new fields are
additive; existing readers/tests unaffected.

### Per-episode metric shape (REQ-3)
```ts
export interface MeanWithCI {          // generalises RateWithCI for means
  readonly value: number;              // sample mean
  readonly n: number;                  // resolved-episode count
  readonly ci_low: number;
  readonly ci_high: number;
  readonly low_confidence?: boolean;    // true when n < 5 (F4)
}
// By-arm metrics: only the cleanly-attributed ones (F1 — tokens are NOT split by arm).
export interface ArmSplitBlock {
  readonly time_to_edit_ms: MeanWithCI;
  readonly tool_calls: MeanWithCI;
}
export interface PerEpisodeCost {
  readonly overall: ArmSplitBlock & { readonly tp_response_tokens: MeanWithCI };  // tokens overall-only
  readonly by_arm: { tp: ArmSplitBlock; shell: ArmSplitBlock; mixed: ArmSplitBlock };  // disjoint buckets (F8)
  readonly provenance: "observational (no control arm)";
  readonly note: string;               // tp_response_tokens = TP's own tp-weighted volume, not agent cost; mean_time_to_fix_ms (terminal, incl. resolution window) is not effort; arm split = MCP-visible tools only
}
```
`EffectivenessReport` gains `readonly per_episode_cost: PerEpisodeCost;` (REQ-4). All
existing fields — including `mean_time_to_fix_ms` (the terminal duration, unchanged) —
remain.

### Mean CI (REQ-3, NFR-2, F4)
`meanWithCI(values: number[]): MeanWithCI` — `value = mean`; for `n ≥ 2`, sample sd
(Bessel, `n-1`), `half = tCrit(n-1) * sd / sqrt(n)` where `tCrit` is the two-sided 95%
t-critical for `df=n-1` (small hard-coded table for `df 1..29`, `1.96` for `n ≥ 30`) — F4,
because per-repo samples are small and right-skewed; `ci = [max(0, mean - half), mean +
half]` (lower clamped for non-negative quantities); for `n < 2`, `ci_low = ci_high = value`
(REQ-3 AC3 — no fabricated spread); `low_confidence = n < 5`. Distinct from `wilsonInterval`
(proportions only); `round4` is shared (export it from `effectiveness-report.ts`).

## Key sequences

### tp-arm investigation (e.g. `get_error_context` on fp X)
```
handler runs → onErrorInvestigated(X) → FSM: surfaced→investigated,
               recordToolCall(X, arm="tp")  // tool_calls++, arm merges to tp
handler returns → middleware computes response_tokens →
               isTokenAttributable("get_error_context") && args[0].fingerprint===X && episode(X) active →
               fsm.attributeTokens(X, tokens)  // tp_response_tokens += tokens
```

### shell-arm run (`run_and_watch` resolving fp X)
```
handler runs → onCommandRun(cmd, [X]) →
               for each matched ACTIVE episode: recordToolCall(X, arm="shell")  // count++, arm→shell/mixed
               then existing diff logic → maybe endEpisode(X, "resolved")  // arm already stamped, frozen
handler returns → middleware: run_and_watch not in TP_ARM_TOOLS → no token attribution (by design)
```

### report
```
get_effectiveness_report → episodes = fsm.getAllEpisodes()  // completed history across fingerprints
                        → computeEffectivenessReport(metrics, {version, tpResponseTokensTotal, episodes})
                        → per_episode_cost = computePerEpisodeCost(episodes.filter(resolved))
```

## Double-counting & correctness

- `tool_calls` has exactly one writer per call: the hook layer. The middleware only ever
  adds **tokens**, never increments the count. No path increments twice.
- Arm is monotonic via `mergeArm`: `none → tp|shell → mixed`; it never regresses.
- Attribution only ever targets an **active** episode; a call arriving after the episode
  ended attributes nothing (checked in `attributeTokens` and in the hook stamp).
- **F6 (documented limitation):** if `get_error_context` is called on a fingerprint that
  was never surfaced (no active episode), its cost is not attributed — acceptable, because
  agents normally surface (`get_errors`) before investigating; noted, not fixed.

## Persistence (Phase D, REQ-5)

- `journal-types.ts`: add `"episode"` to `JOURNAL_ENTRY_TYPES`; `EpisodeEntryData =
  { fingerprint, started_at, edit_observed_at?, ended_at, outcome, tool_calls, arm,
  tp_response_tokens }`. Bump `TelemetrySummary.version` (1 → 2). **F7:** compaction
  rewrites the file to v2; a pre-existing v1 file loads with `episodes: []` (no migration
  step, no data loss — episodes simply start accumulating from first v2 write).
- FSM `endEpisode` calls an **optional injected** `onEpisodeEnd(episode)` sink (mirrors
  how hooks are injected in `cli.ts`), wired to `journalBridge.journalEpisode`. FSM keeps
  no direct journal dependency (testable in isolation).
- `compactJournal` folds `"episode"` entries into per-fingerprint / global aggregates so
  the report can compute REQ-3 across the retained 50-session window.

## Security & isolation
- No new external surface, no network, no PII, no log content (NFR-4) — only counters,
  timestamps, `outcome`, `arm`. Same privacy envelope as existing telemetry.
- All attribution/journaling best-effort and wrapped so a failure never breaks a tool call
  or an FSM transition (NFR-3), matching TRP-78's middleware discipline.

## Testing strategy
- **Unit (FSM):** episode inits `arm=none`/`tokens=0`; `edit_observed_at` set on the
  `edit_observed` transition; `recordToolCall` stamps + merges arm (tp, shell, tp+shell→
  mixed, neutral leaves unchanged); `attributeTokens` only hits active episodes; ended
  episode freezes arm+tokens+`edit_observed_at`; `getAllEpisodes` returns completed.
- **Unit (arms):** `classifyArm`/`mergeArm` truth table incl. unknown tool → null;
  `isTokenAttributable` true only for the three read tools; `verify_fix`→shell, not
  token-attributable (F3).
- **Unit (stats):** `meanWithCI` against hand-computed values with the **t-critical** value
  (`n=0`, `n=1` no spread, `n<5` → `low_confidence`, `n≥2` sd/CI, `n≥30`→1.96); clamp at 0.
- **Unit (episode-cost):** overall block (incl. `tp_response_tokens` overall-only) + per-arm
  `time_to_edit_ms`/`tool_calls` (disjoint tp/shell/mixed) over a fixture; assert tokens are
  NOT split by arm (F1); zero-resolved → `n=0` block with note (REQ-4 AC3).
- **Unit (report):** existing fields unchanged; new `per_episode_cost` present + correct.
- **Integration (wiring):** a real MCP sequence (`get_errors` → `get_error_context` →
  `run_and_watch` re-exercise) advances an episode to resolved with the expected arm and
  non-zero tool_calls; `get_effectiveness_report` returns a populated block. Extends
  `tests/integration/lifecycle-hooks-wiring.test.ts` / `effectiveness-report-tool.test.ts`.
- **Persistence (Phase D):** episode entry round-trips journal write→compact; v1 file with
  no episodes still reads.

## ADR
No new architecture-level decision beyond what ADR-002/M27 already established for
telemetry; this is an extension within the existing FSM/journal/report design. If the
schema-version bump (Phase D) proves contentious in review, capture it as a short ADR
before Phase D lands. (Flagged for the readiness review to confirm.)

## Reuse ledger
- `wilsonInterval` / `rateWithCI` / `round4` — `effectiveness-report.ts` (share `round4`).
- `Episode` / `startEpisode` / `endEpisode` / episode history — `lifecycle-fsm.ts`.
- Command→fingerprint mapping + terminal-transition logic — `onCommandRun` (unchanged).
- Estimated `response_tokens` + middleware wrap — `tool-telemetry.ts` (TRP-78).
