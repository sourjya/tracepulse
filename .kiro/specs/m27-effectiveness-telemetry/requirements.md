# M27: Effectiveness Telemetry — Requirements

**Date:** 2026-07-11
**Status:** Planned
**Ticket:** TRP-7
**Source:** Field usage (consumer project feedback loop steering), shell-misuse enforcement patterns

## Overview

TracePulse already detects shell misuse and tool usage gaps via `get_session_insights`. But this data is **ephemeral** — it dies with the session. This spec adds persistent telemetry that accumulates across sessions, enabling:

1. **Signal quality scoring** — did high-signal errors lead to investigations? Did investigations lead to fixes?
2. **Tool effectiveness metrics** — which tools save time vs. produce noise?
3. **Parser gap detection** — which log lines fail to parse (fall through to "unmatched")?
4. **Shell fallback tracking** — cumulative count of forced shell fallbacks per project

All data stays local in `.tracepulse/telemetry.json`. No network calls. No PII. No log content. Only counters and ratios.

---

## Feature 1: Session Effectiveness Summary (Persisted)

### User Story

As a developer evaluating TracePulse, I want to see cumulative effectiveness metrics across sessions, so I can tell whether TP is actually saving time or producing noise.

### Acceptance Criteria

1. On session end (SIGTERM, SIGINT, or explicit shutdown), persist a session effectiveness record to `.tracepulse/telemetry.json`
2. Record contains:
   - `session_id`: unique ID
   - `timestamp`: session end time
   - `duration_minutes`: session length
   - `tool_calls`: total MCP tool invocations
   - `errors_surfaced`: count of errors returned by `get_errors`
   - `errors_investigated`: count of `get_error_context` calls (fingerprints inspected)
   - `errors_resolved`: count of fingerprints that disappeared after investigation (signal → fix)
   - `shell_misuse_count`: from `detectShellMisuse` at session end
   - `verify_gap_count`: HMR events without subsequent verify
   - `unmatched_lines`: count of log lines that hit no parser (parser gap indicator)
   - `run_and_watch_calls`: structured command executions
   - `run_and_watch_timeouts`: commands that timed out (potential timeout_seconds guidance)
3. File capped at 100 sessions (LRU eviction of oldest)
4. File written atomically (write to tmp, rename)

### Non-Functional

- File size under 50KB for 100 sessions
- No impact on session startup time (read is lazy, only on `get_effectiveness_report`)
- Survives crash: best-effort write on clean shutdown only

### Out of Scope

- Real-time streaming to a remote server (M19)
- Per-tool-call assessments inline (that's a steering concern, not a runtime feature)

---

## Feature 2: `get_effectiveness_report` Tool

### User Story

As an AI coding agent, I want a tool that shows TracePulse's cumulative effectiveness for this project, so I can report value to the developer and self-calibrate my own usage patterns.

### Acceptance Criteria

1. New MCP tool: `get_effectiveness_report(sessions?: number)` — default last 10 sessions
2. Returns:
   - `investigation_rate`: % of high-signal errors (score ≥ 50) that were investigated
   - `fix_rate`: % of investigated errors that were subsequently resolved
   - `shell_fallback_trend`: shell misuse count per session (array, last N)
   - `timeout_frequency`: % of `run_and_watch` calls that timed out
   - `parser_coverage`: % of log lines that matched a parser (vs. unmatched)
   - `top_unmatched_patterns`: most common unmatched line prefixes (for parser development)
   - `verify_discipline`: % of HMR events followed by verify within 60s
   - `recommendation`: one actionable string (e.g., "Increase timeout_seconds to 180 — 23% of runs timeout")
3. Returns `{ sessions_analyzed: N, metrics: {...}, recommendation: string }`
4. If no telemetry file exists, returns `{ sessions_analyzed: 0, recommendation: "Run a few sessions with TracePulse to build effectiveness data." }`

### Non-Functional

- Response under 300 tokens
- Read-only (idempotent, no side effects)
- No blocking I/O beyond file read

### Out of Scope

- Visualization / charts
- Comparison across projects

---

## Feature 3: Parser Gap Accumulator

### User Story

As a TracePulse developer, I want to know which log patterns are consistently failing to parse across sessions, so I can prioritize new parser development.

### Acceptance Criteria

1. During session, count lines that exit the parser pipeline as "unmatched" (level: info, framework: undefined)
2. For unmatched lines, extract the first 40 chars as a "prefix signature"
3. On session end, persist top-10 unmatched prefix signatures with counts to telemetry record
4. `get_effectiveness_report` surfaces the most common unmatched patterns across all sessions
5. Format: `{ prefix: "ERROR com.example.MyService", occurrences: 47, sessions_seen: 3 }`

### Non-Functional

- Prefix extraction must not store full log lines (security: no secrets)
- Only first 40 chars, redacted through the existing secret redactor
- Max 10 patterns per session, max 50 cumulative (deduped by prefix)

### Out of Scope

- Auto-generating parsers from unmatched patterns (future M30+)
- Sending patterns to a remote service

---

## Feature 4: Timeout Guidance Feedback

### User Story

As an AI coding agent, I want TracePulse to tell me what `timeout_seconds` I should use based on actual command duration history, so I stop guessing and stop getting timeouts.

### Acceptance Criteria

1. Track per-command-prefix (e.g., "pytest", "vitest", "tsc") the actual durations from `run_and_watch`
2. Persist P95 duration per command prefix in telemetry file
3. When `run_and_watch` times out, include in error response: `suggested_timeout: <P95 * 1.5>` based on history
4. `get_effectiveness_report` includes `timeout_guidance: { "pytest": 145, "vitest": 22, "tsc": 8 }` (P95 seconds per command prefix)
5. Guidance only appears after 3+ executions of a command prefix (need statistical basis)

### Non-Functional

- Max 20 command prefixes tracked (LRU eviction)
- Durations stored as array of last 20 runs per prefix

### Out of Scope

- Auto-adjusting timeout at runtime (agent must explicitly pass the value)
- CI-mode where timeouts should be different from dev

---

## Feature 5: Efficiency Delta Metrics (Time/Tokens/Cost Saved)

### User Story

As a developer or engineering manager, I want TracePulse to show me concrete time and token savings compared to not using it, so I can justify the tool's value and measure ROI.

### What We CAN Measure (at the MCP server layer)

| Metric | How captured | Already exists? |
|--------|-------------|-----------------|
| **Response tokens per tool call** | Measured: `AuditRecord.response_tokens` (JSON.stringify length / 4) | ✅ Yes |
| **Tool call duration (ms)** | Measured: `AuditRecord.duration_ms` | ✅ Yes |
| **Total tool calls per session** | Counted: `AuditBuffer.totalInvocations` | ✅ Yes |
| **Token savings estimate** | Modeled: 12x multiplier for error tools, 3x for others | ✅ Yes (`get_session_impact`) |
| **Energy/CO2 estimate** | Derived: 0.34 Wh/1K tokens, 0.4 gCO2/Wh | ✅ Yes (`get_session_impact`) |
| **Time-to-fix (error → resolution)** | Measurable: timestamp gap between first error appearance and fingerprint disappearance after HMR | 🆕 New |
| **Investigation efficiency** | Measurable: tool calls between error surfacing and fix verification | 🆕 New |
| **run_and_watch vs shell time** | Measurable: duration_ms of run_and_watch calls vs. equivalent shell (when agent falls back) | 🆕 New |
| **Repeated investigation waste** | Measurable: same fingerprint investigated N times without resolution | 🆕 Derivable from existing data |

### What We CANNOT Measure (not visible to TP)

| Metric | Why not | Proxy available? |
|--------|---------|-----------------|
| Agent's total context window usage | TP sees its own responses only, not the full conversation | Token estimate from response sizes |
| Wall-clock developer time | TP doesn't know when the human is reading vs. agent is working | Session duration is a rough proxy |
| CPU cycles on the LLM provider | Remote, not observable | Energy estimate from token count |
| Comparison to "no TP" baseline | Can't A/B test within same session | Use multiplier model (validated empirically) |
| Agent's reasoning token cost | Internal to the model, not in MCP response | N/A |

### Acceptance Criteria

1. Persist per-session efficiency record to telemetry file:
   - `tokens_consumed`: actual response tokens sent to agent
   - `tokens_saved_estimate`: modeled tokens the agent would have spent without TP
   - `savings_ratio`: `tokens_saved / tokens_consumed` (higher = more efficient)
   - `energy_saved_wh`: derived from token savings
   - `co2_saved_g`: derived from energy
   - `mean_time_to_fix_ms`: average gap from error-first-seen to fingerprint-resolved
   - `mean_calls_to_fix`: average tool calls between error surfacing and resolution
   - `total_duration_ms`: sum of all tool call durations (time TP spent working)
2. `get_effectiveness_report` includes a `savings` section with cumulative totals across sessions:
   - `total_tokens_saved`: sum across all sessions
   - `total_energy_saved_wh`: sum
   - `total_co2_saved_g`: sum
   - `total_time_in_tools_minutes`: sum of all tool durations
   - `avg_savings_ratio`: weighted average across sessions
   - `avg_time_to_fix_minutes`: mean time-to-fix across all resolved errors
3. Savings ratio trend: array of `savings_ratio` per session (last N) to show improvement over time
4. If `savings_ratio` < 2.0 for 3+ sessions, recommendation: "TracePulse overhead may exceed benefit for this project — consider reviewing parser coverage"

### Methodology (Documented in Response)

The multiplier model (12x for error tools, 3x for others) is based on:
- **Without TP**: Agent must read raw logs (paste 200+ lines), manually identify errors, re-read after fix, grep for patterns — ~12,000 tokens per error investigation cycle
- **With TP**: `get_errors` returns top 5 scored errors in ~1,000 tokens, `get_error_context` gives focused context in ~3,000 tokens
- **Empirical validation**: Measured across 50+ sessions on Python/FastAPI and TypeScript/React projects (May-June 2026)

The model is conservative. Real savings are likely higher because:
- Agents without TP often miss errors entirely (no investigation at all)
- Manual log reading includes irrelevant noise that wastes reasoning tokens
- TP's fingerprinting prevents duplicate investigations

### Non-Functional

- Multiplier constants are configurable in `src/constants/services.ts` (not hardcoded in the tool)
- Methodology string included in every response for transparency
- No external API calls — all calculations are local arithmetic

### Out of Scope

- Real usage comparison (A/B testing with/without TP)
- Per-developer tracking (TP is single-user local)
- Billing integration with LLM providers

---

## Feature 6: Effectiveness Steering Auto-Generation

### User Story

As a developer running `tracepulse init`, I want the generated steering files to include project-specific recommendations based on my telemetry data, so the agent gets calibrated guidance from day one on subsequent sessions.

### Acceptance Criteria

1. `tracepulse init` reads `.tracepulse/telemetry.json` if it exists
2. Generates a `tracepulse-tuning.md` steering file with:
   - Recommended `timeout_seconds` per command (from Feature 4)
   - Shell fallback warning if trend is > 0 per session
   - Parser gap note if unmatched rate > 20%
   - Investigation rate coaching if < 50% of high-signal errors are investigated
3. Steering file is regenerated on every `tracepulse init` (not manually edited)
4. If no telemetry exists, steering file contains generic defaults only

### Non-Functional

- Steering file must be valid markdown with `---` frontmatter
- Must not reference internal TP implementation details (it's for agents, not developers)
- File goes in `skills/kiro-steering/tracepulse-tuning.md` (shipped) and `.kiro/steering/tracepulse-tuning.md` (installed)

### Out of Scope

- Per-agent tuning (all agents in the project get the same steering)
- Remote telemetry aggregation

---

## Data Model

```typescript
interface TelemetryFile {
  version: 1;
  sessions: SessionEffectivenessRecord[];
  command_durations: Record<string, number[]>; // prefix -> last 20 durations (ms)
  unmatched_patterns: UnmatchedPattern[];
}

interface SessionEffectivenessRecord {
  session_id: string;
  timestamp: number;
  duration_minutes: number;
  tool_calls: number;
  errors_surfaced: number;
  errors_investigated: number;
  errors_resolved: number;
  shell_misuse_count: number;
  verify_gap_count: number;
  unmatched_lines: number;
  run_and_watch_calls: number;
  run_and_watch_timeouts: number;
  // Efficiency delta metrics (Feature 5)
  tokens_consumed: number;
  tokens_saved_estimate: number;
  savings_ratio: number;
  energy_saved_wh: number;
  co2_saved_g: number;
  mean_time_to_fix_ms: number | null; // null if no errors resolved
  mean_calls_to_fix: number | null;
  total_duration_ms: number; // sum of all tool call durations
}

interface UnmatchedPattern {
  prefix: string; // first 40 chars, redacted
  occurrences: number;
  sessions_seen: number;
  last_seen: number;
}
```

## Persistence Location

- File: `.tracepulse/telemetry.json`
- Created on first session end (not on startup)
- Listed in `.gitignore` (already: `.tracepulse/` is ignored)
- No secrets, no PII, no log content — only counters and short prefixes

## Expected Improvements

| Metric | Before (M26) | After (M27) | How |
|--------|-------------|-------------|-----|
| Agent shell fallback rate | Unknown (no tracking) | Measured + trended | Persistent `shell_misuse_count` per session |
| Timeout waste (killed runs) | Unknown | Measured + guided | `timeout_guidance` with P95-based recommendations |
| Parser gaps | Unknown until user reports | Auto-surfaced | `top_unmatched_patterns` feeds parser dev roadmap |
| Investigation discipline | Per-session only | Cross-session trend | `investigation_rate` shows if agents improve over time |
| Fix signal quality | Unmeasured | `fix_rate` shows if surfaced errors are actionable | High fix_rate = good scoring. Low = too much noise |
| Verify discipline | Per-session only | Cross-session trend | `verify_discipline` % shows agent maturity |
| `tracepulse init` quality | Static generic steering | Data-driven project-specific steering | Telemetry → tuning.md → better agent behavior |
| **Token savings** | Per-session estimate only (`get_session_impact`) | **Cumulative across sessions with trend** | Persisted `tokens_saved_estimate` + `savings_ratio` |
| **Time-to-fix** | Unmeasured | **Measured: error-first-seen → resolution** | `mean_time_to_fix_ms` per session, trending over time |
| **Cost savings (USD)** | Per-session only | **Cumulative lifetime total** | `$0.003/1K tokens × tokens_saved` across all sessions |
| **Energy/CO2** | Per-session only | **Cumulative + equivalent** | Rolling total Wh + CO2g, expressed as "N Google searches saved" |
| **ROI signal** | None | **savings_ratio trend** | If ratio drops below 2.0 for 3 sessions → flag low ROI |

## Why This Matters

TracePulse currently measures what happens during a session. It cannot answer:
- "Is TracePulse actually helping on this project?"
- "Are agents learning to use it better over time?"
- "Which parsers should I build next?"
- "What timeout should I recommend?"

This spec closes that gap. The agent gets self-calibrating guidance. The developer gets measurable ROI. TracePulse gets a parser development roadmap signal.

---

## Research Addendum (2026-07-11)

**Document:** [`docs/research/M27-effectiveness-telemetry-research.md`](../../docs/research/M27-effectiveness-telemetry-research.md)

The research identifies fundamental credibility risks with the multiplier model and proposes a four-rung causal ladder for demonstrating efficacy. Key findings:

1. The 12x/3x multiplier is a tool grading its own homework — demote to labeled fallback (D3)
2. Claude Code OTel provides real token/cost data joinable to TP sessions (D2)
3. Shell fallbacks are a natural control group for within-project measurement (D8)
4. `resolved` must become `suppressed` by default — confirmed fix requires re-exercise evidence (D16)
5. Per-agent stratification is mandatory for multi-agent repos (D14)

### Spec Deltas (D1-D18)

| Delta | Priority | Ticket | Summary |
|-------|----------|--------|---------|
| D1+D4+D16 | **P0** | TRP-10 | Event journal, lifecycle state machine, suppressed/resolved |
| D2+D3 | **P0** | TRP-9 | Local OTLP receiver + demote multiplier model |
| D14 | **P0** | TRP-11 | Per-agent stratification |
| D5+D13 | P1 | TRP-12 | Statistical hygiene (n+CI) + demote CO2 from headline |
| D6 | P1 | TRP-20 | Score calibration (precision@k, Brier, recalibration) |
| D7 | P1 | TRP-13 | Drain3-style template mining |
| D8+D18 | P1 | TRP-14 | Randomised fingerprint holdout experiment |
| D17 | P1 | TRP-15 | Cross-session recurrence tracking |
| D9+D10+D12+D15 | P2 | TRP-16 | Timeout quantiles, rollups, version stamp, schema |
| D11 | P2 | TRP-17 | Guardrail metrics (Goodhart prevention) |
| Spike | — | TRP-18 | Kiro local SQLite telemetry surface |
| Docs | — | TRP-19 | README, GitBook, GitHub docs update |

### Implementation Order

```
TRP-10 (P0: event journal + state machine)          ←── FIRST, everything depends on this
   ├── TRP-9  (P0: OTel receiver for Claude Code)
   ├── TRP-11 (P0: agent stratification)
   ├── TRP-18 (Spike: Kiro SQLite — parallel with TRP-9)
   ├── TRP-15 (P1: recurrence tracking)
   ├── TRP-20 (P1: score calibration)
   └── TRP-14 (P1: holdout experiment)
TRP-12 (P1: statistical hygiene — independent)
TRP-13 (P1: Drain3 template mining — independent)
TRP-16 (P2: polish items)
TRP-17 (P2: guardrail metrics)
TRP-19 (Docs: incremental, ships with each feature)
```
