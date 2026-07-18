# TRP-82: Investigation-Episode Segmentation + Modality Tag — Implementation Plan

**Ticket:** TRP-82 · Satisfies REQ-1..REQ-5 (`requirements.md`), per `design.md`.
TDD throughout: write the failing test (RED), minimal implementation (GREEN), refactor.
Each task is a small reviewable increment. **PR 1 = Phase A–C** (live in-session metric);
**PR 2 = Phase D** (durability + schema bump).

## Phase A — Episode cost + modality (in-memory)

- [ ] **A1. Arm classification module — two axes (REQ-2 AC1, AC5; F3).** RED:
  `tests/unit/store/tool-arms.test.ts` — `classifyArm` returns `tp`/`shell`/`null` for
  representative tools + unknown; `verify_fix`→`shell` (NOT tp); `mergeArm` truth table
  (`none→tp`, `none→shell`, `tp+shell→mixed`, `x→x`); `isTokenAttributable` true only for
  `get_error_context`/`get_prompt_context`/`acknowledge_error` (false for `verify_fix`).
  GREEN: add `src/store/tool-arms.ts` with `TP_ARM_TOOLS`, `SHELL_ARM_TOOLS`,
  `TOKEN_ATTRIB_TOOLS`, `classifyArm`, `mergeArm`, `isTokenAttributable`.
- [ ] **A2. Extend `Episode` with `arm`, `tp_response_tokens`, `edit_observed_at` (REQ-1;
  F2).** RED: extend `tests/unit/store/lifecycle-fsm-episodes.test.ts` — a started episode has
  `arm="none"`, `tp_response_tokens=0`; `edit_observed_at` is set on the `edit_observed`
  transition; an ended episode freezes all three. GREEN: add fields to `Episode` +
  `MutableEpisode`; init in `startEpisode`; stamp `edit_observed_at` on the transition to
  `edit_observed`; copy in `endEpisode`.
- [ ] **A3. `recordToolCall(fp, arm?)` stamps arm (REQ-1 AC2–AC5).** RED: tests — tp stamp →
  `tp`; shell stamp → `shell`; both → `mixed`; no-arm call leaves arm unchanged and still
  counts. GREEN: extend `recordToolCall` to merge arm via `mergeArm` when an arm is passed.
- [ ] **A4. `attributeTokens(fp, tokens)` + `getAllEpisodes()` (REQ-1 AC2, REQ-3 input).** RED:
  tests — `attributeTokens` adds to an active episode's `tp_response_tokens`, is a no-op when
  no active episode; `getAllEpisodes()` returns completed history across fingerprints. GREEN:
  implement both on the FSM.

## Phase B — Attribution wiring

- [ ] **B1. Hook layer stamps arm + counts (REQ-2 AC1, AC3).** RED: extend
  `tests/unit/store/lifecycle-hooks.test.ts` — `onErrorInvestigated` stamps `arm=tp`;
  `onCommandRun` stamps `arm=shell` and counts on matched **active** episodes *before* any
  terminal transition (assert a resolved episode carries `arm=shell`). GREEN: pass `"tp"` from
  `onErrorInvestigated`'s `recordToolCall`; in `onCommandRun`, stamp+count active episodes
  ahead of the resolve/recur diff.
- [ ] **B2. Middleware token attribution (REQ-2 AC2–AC4; F1/F3).** RED: extend
  `tests/unit/mcp/tool-telemetry.test.ts` — an `isTokenAttributable` call with an active
  episode gets `tp_response_tokens` added; a call with no `fingerprint` param (`get_errors`)
  attributes nothing; `verify_fix` (shell-arm) attributes NO tokens; a thrown attribution never
  breaks the tool call. GREEN: in `tool-telemetry.ts`, after the result, best-effort resolve
  `args[0].fingerprint` + `isTokenAttributable(tool)` → `fsm.attributeTokens(fp,
  response_tokens)`, wrapped so failure is swallowed.

## Phase C — Metric + report surface

- [ ] **C1. `meanWithCI` helper — t-critical (REQ-3 AC2–AC3, NFR-2; F4).** RED:
  `tests/unit/analysis/episode-cost.test.ts` — `n=0`→zeros; `n=1`→`ci=value`; `n<5`→
  `low_confidence:true`; `n≥2`→hand-computed mean + `t(0.975,n−1)·sd/√n`; `n≥30`→1.96; lower
  clamp at 0. GREEN: add `meanWithCI` + a small t-critical table in
  `src/analysis/episode-cost.ts`; export/share `round4`.
- [ ] **C2. `computePerEpisodeCost` (REQ-3 AC1, AC4–AC5; F1).** RED: tests over a fixture of
  resolved + non-resolved + mixed-arm episodes — overall block carries `time_to_edit_ms`,
  `tool_calls`, and `tp_response_tokens` (overall-only); `by_arm` carries `time_to_edit_ms` +
  `tool_calls` for **disjoint** `tp`/`shell`/`mixed` and **no** per-arm tokens (assert absent,
  F1); only resolved episodes counted; `provenance`/`note` present; zero-resolved → `n=0`
  block. GREEN: implement over `episodes.filter(resolved)`.
- [ ] **C3. Extend `EffectivenessReport` (REQ-4 AC1–AC2).** RED: extend
  `tests/unit/analysis/effectiveness-report.test.ts` — existing fields unchanged;
  `per_episode_cost` present and populated when episodes passed. GREEN: add `per_episode_cost`
  to `EffectivenessReport`; `computeEffectivenessReport` accepts `episodes` and computes it.
- [ ] **C4. Wire handler (REQ-4 AC3–AC4).** RED: extend
  `tests/integration/effectiveness-report-tool.test.ts` — `get_effectiveness_report` returns a
  `per_episode_cost` block; zero-resolved path returns `n=0` + accumulating note, no error.
  GREEN: `get-effectiveness-report.ts` gathers `fsm.getAllEpisodes()` and passes them in.
- [ ] **C5. End-to-end integration (REQ-1..REQ-4).** RED: extend
  `tests/integration/lifecycle-hooks-wiring.test.ts` — a real MCP sequence (`get_errors` →
  `get_error_context` → `run_and_watch` re-exercise absent) yields a resolved episode with the
  expected `arm` and non-zero `tool_calls`, and the report block reflects it. GREEN: fix any
  wiring gaps surfaced.
- [ ] **C6. Changelog + docs.** Add the `TRP-82` CHANGELOG entry; update the
  `effectiveness-report.ts` stub note (`pending TRP-82`) to reflect the shipped block. Ship
  PR 1 (Phase A–C) via `ship-pr` with bidirectional TRP-82 cross-link; `/code-review` first.

## Phase D — Persistence (second PR)

- [ ] **D1. `episode` journal entry type + schema bump (REQ-5 AC1, AC3).** RED:
  `tests/unit/persistence/journal-types.test.ts` — `EpisodeEntryData` shape; `TelemetrySummary`
  version 2; a v1 file (no episodes) still reads → `episodes: []` (F7). GREEN: add `"episode"`
  to `JOURNAL_ENTRY_TYPES` + `EpisodeEntryData` (incl. `edit_observed_at?`); bump version with
  back-compat.
- [ ] **D2. `journalEpisode` + FSM `onEpisodeEnd` sink (REQ-5 AC1, NFR-3).** RED: tests —
  `endEpisode` invokes an injected sink with the frozen episode; `journalEpisode` writes an
  `episode` entry; failure never breaks the transition. GREEN: add optional `onEpisodeEnd` to
  the FSM (injected in `cli.ts`), `journalBridge.journalEpisode`.
- [ ] **D3. Compaction aggregation (REQ-5 AC2).** RED: extend
  `tests/unit/persistence/event-journal-compaction.test.ts` — `compactJournal` folds `episode`
  entries into aggregates the report can consume. GREEN: handle `"episode"` in `compactJournal`.
- [ ] **D4. Cross-session report path + changelog.** RED: report computes REQ-3 metrics from
  persisted episodes across the retained window. GREEN: wire the persisted aggregates into the
  report input. Add the Phase-D CHANGELOG entry; ship PR 2 via `ship-pr` with TRP-82 cross-link;
  `/code-review` first. If the schema bump drew review debate, land the short ADR (per design).
```
