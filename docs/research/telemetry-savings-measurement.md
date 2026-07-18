# Telemetry & Savings Measurement — Research and Model

**Ticket:** TRP-73 · **Status:** analysis complete, implementation spun into child tickets · **Date:** 2026-07-18

> **Headline.** TracePulse's three runtime measurement surfaces — the audit buffer, the lifecycle FSM, and the event-journal rollup — are **defined and unit-tested but never wired into the live tool-call path**. In a real session they emit zeros. Every quantified savings number the product reports today is therefore **asserted from a hardcoded model, not measured**. The highest-leverage work is not new infrastructure — it is turning on the code that already exists.

---

## (a) What telemetry exists today

Three surfaces are built, each with its own tool:

| Surface | Source | Read by | Intended signal |
|---------|--------|---------|-----------------|
| **Audit buffer** | `src/store/audit-buffer.ts` — ring buffer of `{tool, response_tokens, duration_ms, …}` | `get_audit_trail`, `get_session_impact` | Per-call token/latency accounting |
| **Lifecycle FSM** | `src/store/lifecycle-fsm.ts` — per-fingerprint state machine (`first_seen → surfaced → investigated → edit_observed → suppressed → resolved → recurred`) | `get_session_insights` (`lifecycle_metrics`) | Confirmed fix rate, recurrence rate, mean-time-to-fix |
| **Event-journal rollup** | `src/persistence/event-journal.ts` + `journal-bridge.ts` → `.tracepulse/telemetry.json` | Cross-session history | Per-session/fingerprint durable metrics |

Estimator/reporting tools layered on top: `get_session_impact` (environmental: tokens/energy/CO₂), `pattern-cost.ts` (per-pattern cost model), `get_session_insights` (lifecycle metrics + uninvestigated errors).

## (b) How savings are currently estimated/claimed

`get_session_impact` (`src/tools/get-session-impact.ts`) computes "tokens saved" by multiplying the session's recorded response tokens by a **hardcoded counterfactual**:

- `ERROR_TOOL_MULTIPLIER = 12` — assumes an error investigation would cost 12× more tokens without TracePulse.
- `OTHER_TOOL_MULTIPLIER = 3` — 3× for non-error tools.
- Energy: `0.34 Wh / 1K tokens`; CO₂: `0.4 gCO₂e / Wh`; "equivalent" in Google searches.

The 12×/3× ratios are not derived from a control arm — they are constants. The tool is, in effect, **grading its own homework**: it assumes the savings, then reports them as output.

## (c) Gaps — the measuring code is dead on the wire

Verified against source by grep on 2026-07-18 (see Appendix for exact call sites):

1. **Audit buffer is never written.** `auditBuffer.record(...)` has **zero real call sites in `src/`** (only unrelated `z.record()` Zod hits). It's called only in `tests/`. So `get_session_impact` reads `auditBuffer.query(500)` → empty → `total_response_tokens = 0` → **every environmental number is 0** in a real session.
2. **FSM never advances past `first_seen`.** The four episode-producing hooks — `onErrorsSurfaced`, `onErrorInvestigated`, `onCommandRun`, `onReExercisedAbsent` — have **zero invocations in `src/`**. Only `onFileChanged` / `onErrorRecurred` are wired (`cli.ts:542,548`), and they require states nothing ever reaches. So `computeLifecycleMetrics(fsm)` (`get-session-insights.ts:148`) returns all-zeros. This directly contradicts `skills/tracepulse/SKILL.md` ("lifecycle tracking happens automatically").
3. **Journal rollup is hardcoded.** `journalToolCall()` (`journal-bridge.ts:162`) is **never called**; `session_end` hardcodes `errors_suppressed: 0, errors_resolved: 0` (`journal-bridge.ts:196-197`, comment: "Will be populated by FSM integration later"). The local `.tracepulse/telemetry.json` confirms: every session `error_count: 0, unique_fingerprints: 0, fingerprints: {}`.
4. **Estimator constants disagree 10×.** `get-session-impact.ts` uses `WH_PER_1K_TOKENS = 0.34` (ChatGPT-avg); `pattern-cost.ts:20` uses `0.034` (arXiv 2512.03024). Same quantity, two values, 10× apart — so the two "impact" surfaces can't be reconciled.
5. **No provenance labelling.** Modeled outputs are presented identically to measured ones; nothing marks a number as `estimated (unvalidated model)`.

**Net:** the telemetry surface is inert, and the numbers users see are a model's assumptions echoed back. Fixing this is a credibility prerequisite for any savings claim.

## (d) Measurement model — the fix, highest-leverage first

**Phase 1 — turn on the code that already exists (pure wiring, already unit-tested):**

1. **Middleware on `server.registerTool`** (`src/mcp/server.ts:320+`): wrap every handler so it records `auditBuffer.record({tool, response_tokens: ceil(JSON.stringify(result).length/4), duration_ms, …})` and `journalBridge.journalToolCall(tool, fingerprint?)`. One wrapper flips the whole audit + journal surface from empty to live.
2. **Fire FSM hooks from handlers:** `onErrorsSurfaced` in `get_errors`, `onErrorInvestigated` in `get_error_context`/`get_prompt_context`/`acknowledge_error`, `onCommandRun` in `run_and_watch`. This lets the FSM advance and `lifecycle_metrics` become real.
3. **Populate `session_end` rollup** from `computeLifecycleMetrics(fsm)` instead of hardcoded zeros.

**Phase 2 — make the signal honest, then real:**

4. **Reconcile constants + label provenance.** One source of truth for energy/CO₂; relabel modeled outputs `provenance: "estimated (unvalidated model)"`; drop CO₂/energy from headline claims until measured.
5. **Investigation-episode segmentation + modality tag** (TP-arm vs shell-arm vs mixed) → first *observational* tokens/time-per-resolved-episode reported as `{value, n, ci}` rather than a point multiplier.
6. **Local OTLP receiver** for Claude Code telemetry (`claude_code.token.usage`, `cost.usage`, `active_time`, `tool_result`; `CLAUDE_CODE_ENABLE_TELEMETRY=1`) → an exact token/$ denominator and a real shell-fallback control arm.
7. **`get_effectiveness_report` tool:** cumulative confirmed-fix-rate / recurrence-rate / tokens-per-episode as `{value, n, ci}`, stratified by agent, stamped with `tp_version` + `parser_set_hash`.
8. **Opt-in randomized fingerprint holdout** (default-OFF, critical-score safety rail, kill switch) → the first *causal* per-repo efficacy number.

Tickets 1–3 are pure wiring of already-tested code and flip the telemetry surface from inert to live **before any new infrastructure**. Everything downstream (honest numbers, charts, causal claims) depends on them.

## (e) Making sense of telemetry — charts & reporting (without distracting from core ops)

**Design constraint:** TracePulse's core ops (watch dev-server output → parse → score → serve over MCP) must stay untouched and overhead-free. Visualization is therefore an **on-demand, read-only surface** over already-persisted data — never a background daemon, always-on dashboard server, or hot-path hook.

Proposed, in priority order:

1. **`tracepulse report [--html]` CLI command (primary).** Reads `.tracepulse/telemetry.json` + the event journal and renders a **single self-contained HTML file** (inline SVG + inline CSS/JS, no external deps — same constraints as a shareable artifact). On-demand, zero runtime cost, nothing added to the watch loop. Charts:
   - Tokens-saved and tokens-per-resolved-episode **trend** across sessions (with `n` and CI once Phase 2 lands).
   - **Confirmed-fix-rate vs recurrence-rate** over time.
   - Tokens-per-episode **distribution**, split TP-arm vs shell-arm (the honest comparison).
   - Tool-usage **mix** (which tools carry the load).
   - Every chart stamped with `provenance` (measured vs estimated) so a modeled number never masquerades as observed.
2. **Terminal sparklines in `get_session_insights` (lightweight).** A one-line trend (Unicode blocks) inline in the existing tool output — no new surface, no new command.
3. **`get_effectiveness_report` returns structured series (ticket 7).** The agent/host renders them (e.g., as a Claude artifact) without TracePulse shipping a UI.

**Explicitly out of scope** (would distract from core ops): an always-on metrics dashboard server, a background telemetry UI, third-party charting deps in the runtime, or any collector on the hot path. Follow the repo's `dataviz` guidance (accessible palette, theme-aware, provenance labels) when the report is built.

## (f) Proposed child tickets

Filed as child tickets of TRP-73:

| # | Ticket | Depends on | Value |
|---|--------|-----------|-------|
| 1 | [TRP-78] `registerTool` middleware → audit buffer + `journalToolCall` | — | Flips audit + journal surface live |
| 2 | [TRP-79] Fire FSM episode hooks from handlers | — | `lifecycle_metrics` becomes real |
| 3 | [TRP-80] Populate `session_end` rollup from `computeLifecycleMetrics` | 2 | Durable cross-session metrics real |
| 4 | [TRP-81] Reconcile energy/CO₂ constants + `provenance` labels | 1 | Numbers become honest |
| 5 | [TRP-82] Investigation-episode segmentation + modality tag | 1,2 | First observational per-episode metric |
| 6 | [TRP-83] Local OTLP receiver for Claude Code telemetry | — | Exact token/$ denominator + control arm |
| 7 | [TRP-84] `get_effectiveness_report` tool (`{value,n,ci}`, stratified) | 3,5 | Credible cumulative report |
| 8 | [TRP-85] Opt-in randomized fingerprint holdout (default-OFF) | 5 | First causal efficacy number |
| 9 | [TRP-86] `tracepulse report --html` dashboard + sparklines | 3,4,7 | Charts/graphs, read-only, off the hot path |

**Do tickets 1–3 first** — they are pure wiring of already-tested code and are the prerequisite that turns the entire telemetry surface from inert to live.

## Appendix — verification (grep, 2026-07-18)

- `auditBuffer.record(` in `src/`: **0** (only `z.record()` in `mcp/server.ts`).
- FSM episode-hook invocations in `src/`: **0** (`onFileChanged`/`onErrorRecurred` only, `cli.ts:542,548`).
- `journalToolCall` call sites in `src/`: **0** (defined `journal-bridge.ts:57,162`).
- `session_end` zeros: `journal-bridge.ts:196-197`.
- Constant disagreement: `get-session-impact.ts:20` = `0.34`; `pattern-cost.ts:20` = `0.034`.
- `computeLifecycleMetrics` reader: `get-session-insights.ts:148` (reads an FSM that never advances).
