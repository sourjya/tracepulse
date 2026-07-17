# M27 Research Addendum: Measuring TracePulse Efficacy and Closing the Improvement Loop

**Date:** 2026-07-11
**Companion to:** M27 Effectiveness Telemetry requirements
**Status:** Research / recommended spec deltas

---

## 0. The one-paragraph verdict

M27 as written is a good *instrumentation* spec and a weak *evidence* spec. Features 1-4 and 6 are sound and shippable. Feature 5 is where it breaks: the headline claim ("we saved you N tokens, N Wh, N grams of CO2") rests on a 12x/3x multiplier that TracePulse itself chose, applied to a counterfactual TracePulse never observed. That is a tool grading its own homework with a rubric it wrote. The good news: you do not need to guess the counterfactual, because two real measurement channels are sitting unused - the coding agent's own OpenTelemetry stream, and the shell-fallback episodes that are already happening inside your sessions and constitute a natural control group.

---

## 1. Why the multiplier model is the biggest risk in the spec

The most-cited evidence in this space cuts directly against self-declared productivity numbers. METR's randomized controlled trial of experienced developers on mature repositories found that the developers were roughly 19% *slower* with AI tooling, while believing they had been about 20% faster - a persistent gap between perceived and measured performance. METR's own follow-up (Feb 2026) then found selection effects severe enough that they are redesigning the study. Two lessons:

1. **Perceived and modeled savings are not evidence.** They are hypotheses.
2. **Even careful researchers with no commercial stake get the sign wrong.** A vendor-authored multiplier baked into the product will be read as marketing, and rightly so.

If TracePulse ships a report saying "12x token savings" and a sceptical engineering manager asks "measured how?", the honest answer today is "we assumed it." That is a credibility bomb with a very short fuse - and it is entirely avoidable, because the measurement is available.

Second-order risk: the multiplier is also a **Goodhart trap** for your own roadmap. `savings_ratio` computed as `12 x errors_surfaced / tokens_consumed` rewards surfacing *more errors*, not surfacing *better errors*. Optimise it and TracePulse gets chattier, not sharper.

---

## 2. Three ground-truth channels you are not using yet

### 2.1 The agent's own OTel stream (the big one)

The M27 spec asserts under "What We CANNOT Measure" that the agent's total context usage and the LLM cost are invisible to TracePulse. That is no longer true for the primary target agent.

Claude Code has native, opt-in OpenTelemetry export (`CLAUDE_CODE_ENABLE_TELEMETRY=1`, OTLP metrics + log events). It emits, among others:

| Signal | What it gives TracePulse |
|---|---|
| `claude_code.token.usage` (input / output / cacheRead / cacheCreation, by model, by session) | **Real** token denominator, not an estimate from `JSON.stringify(...).length / 4` |
| `claude_code.cost.usage` (USD, per request, with model + session attributes) | **Real** cost, correctly priced for cache reads - your flat `$0.003/1K` is wrong by a wide margin once caching is in play |
| `claude_code.active_time` | Active developer time excluding idle - a far better time denominator than session wall-clock |
| `tool_result` events (tool name, duration, success/failure, parameters) | Every Bash/Read/Grep call the agent made, i.e. **shell fallbacks measured directly instead of inferred** |
| `api_request` events, `prompt.id`, `session.id` | Turn-level correlation: which prompt triggered which tool calls |

Every record carries `service.name=claude-code`, and all events share a `prompt.id` that ties an entire agent turn together.

**Implication:** TracePulse should ship a tiny local OTLP receiver (or read from the developer's existing collector) and join on `session.id` / timestamps. That converts M27's entire Feature 5 from *modeled* to *measured*, and turns `detectShellMisuse` from a heuristic into a fact. Other agents (Codex, VS Code Copilot) are emitting OTel too, and the OTel GenAI + MCP semantic conventions are converging on `gen_ai.*` / `execute_tool` naming, so this is a one-time integration against a stabilising standard rather than a per-vendor bespoke hack.

Codename it what it is: **TracePulse gets the receipts.**

### 2.1.1 Kiro is a different animal (and this is the asymmetry that makes D14 mandatory)

Kiro does **not** ship a local OTel exporter. Its telemetry story is enterprise-shaped and admin-controlled, not developer-local:

- An aggregate usage dashboard in the Kiro console, plus **daily per-user CSV reports written to an S3 bucket at 02:00 UTC** (per client type: IDE, CLI, Plugin), plus CloudTrail/CloudWatch for API-level activity.
- Every one of those paths is (a) admin-provisioned, (b) day-granular, and (c) not joinable to a TracePulse session. A CSV that lands tomorrow morning cannot feed `get_effectiveness_report` today, and TP is not going to demand S3 buckets and IAM policies as an install prerequisite.
- A configurable per-event telemetry endpoint has been *requested* (kirodotdev/Kiro issue #7226, still triage), which confirms the capability does not exist today.

There is, however, a viable local path: **Kiro persists session data in a local SQLite database under `~/.kiro/`**, including token usage per session, with cache-write / cache-read / output broken out. The community `kiro-usage` tool reads it directly with no network calls and no credentials. The catch is a real one: Kiro does not expose the exact prompt/completion split, so **input tokens are themselves approximated from character count / 4** - the very estimator M27 was trying to escape. Output tokens from streaming chunks are accurate.

So the honest picture:

| Agent | Token counts | Cost | Tool-call events (shell fallbacks) | Joinable to a TP session |
|---|---|---|---|---|
| Claude Code | Exact, via OTel | Exact (cache-aware) | Yes, `tool_result` events | Yes, real-time, by `session.id` |
| Kiro | Output exact; **input approximated (chars/4)** via local SQLite | Estimated | Unknown - needs the spike | Probably, by timestamp + workspace |

This is the strongest possible argument for D14. The two agents do not just *behave* differently, they are *measured* differently, with different error bars. Pooling them produces a number with no defensible interpretation. Stratify, and report the measurement provenance (`exact` vs `estimated`) as a field on the record.

### 2.2 Shell fallbacks are your control group

Every time the agent runs `tail -n 200 dev.log | grep -i error` instead of calling `get_errors`, it is voluntarily running the **without-TracePulse arm of your experiment**, inside a real session, on a real bug. You are currently treating those episodes as a defect to be counted (`shell_misuse_count`). They are your most valuable data.

Define an **investigation episode**: a contiguous run of tool calls from the first appearance of an error fingerprint to the point the fingerprint stops recurring after an HMR/restart. Classify each episode by modality:

- **TP-arm:** resolved primarily via `get_errors` / `get_error_context` / `run_and_watch`
- **Shell-arm:** resolved primarily via raw log reads (`Bash` cat/tail/grep on a log path, `Read` on a log file)
- **Mixed**

Then compare, using the agent's real token counts from 2.1:

- tokens per resolved episode (TP-arm vs shell-arm)
- tool calls per resolved episode
- wall-clock and active-time per resolved episode
- resolution rate (episodes that end in a fix vs episodes abandoned)

This is observational, not randomised, so it is confounded - the agent probably falls back to shell exactly when TracePulse *failed* it (parser gap, missing framework), which biases the shell arm toward hard problems. Say so out loud in the methodology, report the confound, and control for what you can (error severity score, framework, episode length). An honest confounded measurement beats a clean fabrication every single time.

### 2.3 Error lifecycle outcomes (already latent in your data)

You already have fingerprints and timestamps. What you do not have is a **lifecycle state machine** per fingerprint:

```
first_seen -> surfaced      (returned by get_errors, at rank k, with score s)
           -> investigated  (get_error_context called)
           -> edit observed (file change / HMR event)
           -> suppressed    (fingerprint absent from subsequent runs)
                 |
                 +-- re-exercised? --yes--> still absent --> RESOLVED (confirmed)
                 |                     \--> reappears    --> RECURRED
                 +-- never re-exercised -----------------> SUPPRESSED (unconfirmed)
           -> OR abandoned / session-ended (censored)
```

**The distinction that M27 is missing: absence is not a fix.** A fingerprint stops appearing for at least four reasons, only one of which is good news:

| Why the fingerprint vanished | Is it a fix? |
|---|---|
| The bug was fixed | Yes |
| The code path stopped executing (route removed, feature flag off, test skipped, the agent broke the thing upstream so it never reaches the error) | **No** |
| The log line changed shape (a parser gap masquerading as a fix - and TracePulse *caused* this one) | **No, and it is TP's own bug** |
| The dev server crashed / stopped emitting | **No** |

If TP counts all four as `resolved`, `fix_rate` is inflated by an unknown amount in the direction that flatters the product. That is precisely the failure mode this whole document exists to design out - it would be the multiplier problem wearing a lab coat.

**The fix, in three parts:**

1. **Rename the default outcome to `suppressed`.** It is what you can actually observe. Reserve `resolved` for the confirmed case.
2. **Promotion requires re-exercise evidence.** A fingerprint is `resolved` only once the code path that produced it demonstrably ran again and stayed clean - i.e. a subsequent `run_and_watch` of the same command prefix, or an HMR/restart followed by log volume on the same source/module, with no recurrence. No re-exercise, no promotion. This is cheap: you already have `run_and_watch` command prefixes and HMR events.
3. **Track `recurred_within_7d` as the correction term.** Persist unresolved and recently-resolved fingerprints across sessions (the telemetry file already spans sessions - this costs one array). A fingerprint that comes back inside 7 days demotes its episode from `resolved` to `recurred` and **retroactively corrects every metric that counted it.**

**Downstream consequences (all of them good):**

- `fix_rate` becomes three numbers, not one: `suppressed_rate`, `confirmed_fix_rate`, `recurrence_rate`. Report all three. The gap between the first and the second is a direct measure of how much you were about to overclaim.
- `mean_time_to_fix` should be computed on confirmed fixes only, and reported with the censoring made explicit (see 4.1 - this is survival data, and unresolved-at-session-end is a *censored observation*, not a missing one).
- The scorer label in section 4.1 (`was_actionable`) tightens to `confirmed_fix within the session, not recurred within 7d`. A scorer trained or calibrated against suppression rather than resolution learns to surface errors that are easy to *make disappear*, which is a genuinely perverse objective.
- **`recurrence_rate` is a new product signal in its own right.** A high recurrence rate on a project means the agent is papering over bugs rather than fixing them, and TracePulse is the only tool positioned to notice. That is a *feature*, not just a metric correction.

One honest caveat to carry into the methodology string: "re-exercised" is itself inferred, not observed. A route can run without producing log volume. Treat confirmed resolution as a lower bound and say so - undercounting your own wins is the correct direction to be wrong in.

That state machine is the substrate for everything in sections 3 and 4. Build it once; derive every metric from it.

---

## 3. Demonstrating efficacy: a four-rung causal ladder

Ship the rungs in order. Each is independently useful and each strictly dominates the one below it.

| Rung | Design | Claim it supports | Cost |
|---|---|---|---|
| **L0** | Modeled multiplier (current M27) | "Illustrative estimate" - and label it that way | Free, and worth roughly what it costs |
| **L1** | Observational within-project: TP-arm vs shell-arm episodes, using the agent's real token counts | "In this project, episodes resolved via TP cost X tokens vs Y for raw-log episodes (confounded, n=N)" | Low. Needs 2.1 + 2.3 |
| **L2** | **Randomised tool holdout.** With `holdout_rate: 0.1`, TracePulse deterministically declines to serve `get_errors` for a random 10% of *fresh fingerprints* (returns "TP holdout - investigate manually"), tagging the episode as control | Genuine causal ATE within a project, no external study needed | Medium. This is the single highest-value idea in this document |
| **L3** *(PARKED - local-only decision)* | Opt-in, aggregated, k-anonymised cross-project meta-analysis (Bayesian hierarchical model, partial pooling across projects) | "Across N projects, TP reduces median tokens-to-fix by X% [95% CrI: a, b]" - a defensible public claim | High. This is also the moat |

**Scope decision: L0-L2 only. TracePulse stays local, no network calls, no receiver.** L2 alone produces a per-repo causal number, which is enough to answer "is TP helping *me*" - the question that actually gates adoption. L3 answers "is TP helping *everyone*", which is a marketing question, and marketing questions do not justify building a telemetry backend before revenue.

### On L2 (randomised holdout)

This is unusual and it will feel wrong to deliberately degrade the tool 10% of the time. Do it anyway, opt-in, off by default, starting on our own repositories:

- Randomise at the **fingerprint** level, not the session level. Session-level randomisation destroys the developer's day; fingerprint-level randomisation costs them one investigation and gives you a clean paired comparison inside the same session, same codebase, same agent, same human. It is the closest thing to a within-subject RCT you can get without a research budget.
- Beware carryover: an agent that just learned the error taxonomy from TP earlier in the session carries that context into a holdout episode. This biases the control arm to look *better* than a true no-TP baseline, so your effect estimate is **conservative**. Good. Say so.
- Stopping rule: pre-register a minimum n (say 40 episodes per arm) and use a sequential/Bayesian test so you can stop early without p-hacking yourself.
- Kill switch: `TRACEPULSE_HOLDOUT=0`, and never hold out a fingerprint whose score is above a critical threshold (do not sabotage a production incident to win an argument).
- **Be visible about it.** Every held-out response should say so (`"TP holdout - investigate manually"`), so the developer sees the experiment happening rather than discovering later that the tool was quietly withholding help. See section 11 - the holdout ships as an opt-in, default-OFF user-facing feature, not as a hidden internal mode.

The output is the thing no competitor will have: **"TracePulse reduced tokens-to-fix by 4.1x (95% CrI 2.8-6.0) measured by randomised holdout on your repo, n=87 episodes."** That sentence sells the product. "We assume 12x" does not.

### 3.1 Keeping L3 cheap to unpark later

L3 is parked, and that is the right call - a telemetry backend is a product with its own privacy review, retention policy and on-call rotation, and TracePulse does not have revenue to justify it. But three near-zero-cost choices now mean unparking is a config flag rather than a schema migration:

1. **Make the session record shippable by construction.** No paths, no log content, no project names in `SessionEffectivenessRecord` - only counters, ratios and hashed identifiers. The record you persist locally should be, byte for byte, the record you would one day export. Cost: a naming discipline. If you ever have to strip fields before export, you designed the schema wrong.
2. **Hash the project identity, do not omit it.** `project_id = sha256(repo_remote_url)[:16]`, stored locally. Zero information leaked, but it is the grouping key any future hierarchical model needs. Adding it later means every historical session is un-poolable.
3. **Version the telemetry schema from day one** (`version: 1` is already in the data model - good). Cross-version pooling without a version stamp is how meta-analyses quietly become fiction.

Do those three and L3 stays a live option indefinitely at a cost of roughly forty lines. Skip them and unparking means throwing away every session you ever recorded.

---

## 4. Improving the tool over time: treat the scorer as a classifier

Right now the error score (0-100) is a heuristic that nothing grades. Once you have lifecycle outcomes, the score becomes a **prediction** with an observable label, and TracePulse acquires a training signal.

### 4.1 Score calibration (the highest-leverage self-improvement metric)

Define the label: `was_actionable = (investigated AND confirmed-resolved per section 2.3 AND not recurred_within_7d)`. Note what this excludes: a merely *suppressed* fingerprint does not count. Calibrating a scorer against suppression teaches it to surface errors that are easy to make disappear, which is not the same as errors worth fixing.

Then compute, per project and pooled:

- **Precision@k** for the top-5 the tool returns. Of the errors TP puts in front of the agent, what fraction turn out to be actionable?
- **Recall / miss rate.** Of errors that turned out to be actionable, what fraction did TP rank *below* the fold? This is the metric M27 completely omits, and it is the one that stops the tool from looking great by only surfacing easy things. Detect misses retrospectively: a fingerprint that was never in a top-5 response but disappeared immediately after an edit to the file it named.
- **Calibration curve + Brier score.** Bucket errors by score decile; plot observed actionable-rate per bucket. If score 90 errors are actionable 40% of the time and score 40 errors are actionable 45% of the time, your scorer is noise with a confident voice - and you now know it.
- **Rank-order quality:** nDCG or simply "mean rank of the error that was actually fixed."

Two things fall out of this for free:
1. A **per-project score recalibration** (isotonic regression or a simple logistic re-fit on ~200 labelled fingerprints) that TP can persist locally and apply on top of the heuristic. That is genuine, measurable, local self-improvement with no model training and no network calls.
2. A **parser/scorer roadmap ranked by regret**, not by frequency.

### 4.2 Parser gaps: cluster, do not prefix

40-char prefix signatures will fragment badly on any log line with a leading timestamp, request ID, or PID (which is most of them). Redacting first helps, but the right primitive is **online log template mining** - Drain3 or equivalent - which clusters raw lines into templates (`ERROR <*> failed to connect to <*>`) in a streaming, fixed-depth-tree pass with negligible overhead. Then:

- Rank candidate parsers by **expected regret reduction**, not raw occurrence count: `frequency x P(line is error-bearing) x P(agent had to shell-fallback in sessions where this template appeared)`. A template that appears 4,000 times and is pure noise is worth zero parser effort; a template that appears 12 times and coincides with every shell fallback in the project is your next parser.
- Track **unmatched-rate as a health metric per framework**, not globally - a global 20% unmatched rate hides a 95% unmatched rate on one framework.

### 4.3 Timeouts: quantile sketch, not last-20 array

Feature 4's "last 20 durations, P95" is fine for a first cut but will thrash on bimodal distributions (cold cache vs warm cache test runs are two different populations). Use a **t-digest / DDSketch** (bounded memory, mergeable, accurate in the tails), and model duration as log-normal for the suggestion: `suggested_timeout = exp(mu + 2.5 sigma)` rather than `P95 x 1.5`. Also condition on cold/warm: first run of a command prefix in a session is a different regime.

### 4.4 Did *our releases* actually improve anything?

The self-improvement loop is only closed if you can tell whether shipping M28 made TracePulse better. Stamp `tp_version` and `parser_set_hash` into every session record and run an **interrupted time-series / change-point analysis** (CUSUM or a simple Bayesian change-point) on the key metrics per project across version boundaries. If precision@5 does not move after a scorer change, you shipped a refactor, not an improvement. This is the mechanism that turns TracePulse's telemetry into a product-development flywheel rather than a dashboard.

---

## 5. Statistical hygiene (mandatory, cheap, and currently missing)

1. **Never emit a point estimate without n and an interval.** `mean_time_to_fix_ms` over 3 resolved errors is a random number wearing a suit. Report `{value, n, ci_low, ci_high}` or refuse to report.
2. **Gate every recommendation on a minimum sample.** Feature 4 already does this (3+ executions - raise it to 5). Feature 2's `recommendation` string does not. Add: no recommendation below the power threshold; return `"insufficient data (n=4, need 20)"` instead. An agent acting on a 2-sample "recommendation" is worse than an agent with no recommendation.
3. **Fix the survivorship bias in Feature 1.** "Best-effort write on clean shutdown only" means the sessions that crash - the *worst* sessions, and the ones with the most interesting failure data - are systematically excluded from your effectiveness numbers. This will make TracePulse look better than it is, which is the failure mode you are trying to design out. **Replace the write-on-exit model with an append-only JSONL event journal** (`.tracepulse/events.jsonl`), flushed per event, with a compactor that rolls it into `telemetry.json` on next startup. Cheap, crash-safe, and it gives you the event stream you need for section 2.3 anyway.
4. **Keep rollups, not just the last 100 sessions.** LRU-evicting to 100 sessions destroys your longest-horizon signal (agent maturation over months). Keep raw last-100 + monthly aggregates (counts, sums, sums-of-squares, t-digests). Still well under 50KB.
5. **Report the confounds in the response.** The methodology string is a good instinct; make it carry the caveats, not just the model.

### 5.1 Stratify by agent

A single repository is increasingly worked by more than one coding agent - Kiro and Claude Code side by side is now a common configuration, and the trend is toward more agents, not fewer. Unstratified, every metric in M27 becomes a **Simpson's-paradox generator**: two agents with different tool-call habits, different shell-fallback propensities and different token economics get averaged into a single "the agent is improving" trend line that describes neither of them. Worse, the trend can move purely because the *mix* shifted - a month where Kiro did 80% of the sessions produces a different `investigation_rate` with zero behavioural change in either agent.

Concretely:

1. Add `agent: { name, version }` to `SessionEffectivenessRecord`. Derive it from the MCP client handshake (`clientInfo.name` / `clientInfo.version`), which TP already receives at initialisation - no new plumbing, no guessing.
2. Stratify every cross-session metric in `get_effectiveness_report` by agent, and add `agent_mix` (session share per agent) to the response so a mix shift is visible rather than silently confounding.
3. Gate recommendations per agent. Coaching Kiro on Claude Code's shell-fallback rate is worse than useless - it burns steering budget on a behaviour Kiro does not exhibit.
4. Feature 6's `tracepulse-tuning.md` is currently one file for all agents ("Out of Scope: per-agent tuning"). **Reverse that call.** The steering already lands in agent-specific directories (`.kiro/steering/`); generate per-agent tuning from per-agent telemetry. Same generator, different slice of the data - marginal cost near zero.
5. In the L2 holdout (section 3), block on agent as a stratum. Randomise within agent so the arms stay balanced even if one agent dominates the session count.

The upside is not just hygiene: a per-agent effectiveness report is a **product differentiator**. "Kiro resolves 2.3x more errors per token than Claude Code on this repo, and falls back to shell 4x less" is a genuinely novel piece of intelligence that nobody else can produce, and it makes TracePulse the neutral scorekeeper in a market where every agent vendor grades itself.

---

## 6. Guardrails: what M27 will accidentally optimise for

Every metric you feed back into agent steering (Feature 6) becomes a target the agent optimises. Pair each with a guardrail:

| Steering metric | Perverse behaviour it invites | Guardrail metric |
|---|---|---|
| `investigation_rate` ("investigate more high-signal errors") | Agent calls `get_error_context` reflexively on everything to look diligent | `fix_rate` (investigations per fix) and tokens-per-fix must not rise |
| `fix_rate` | TP surfaces only trivially-fixable errors to keep the ratio high | Recall / miss-rate (4.1), and `errors_recurred_after_fix` |
| `shell_fallback_trend` -> 0 | Agent stops using shell even when shell is genuinely the right tool | Tokens-per-resolved-episode must not rise |
| `savings_ratio` | TP inflates `errors_surfaced` | Precision@5 |
| `verify_discipline` | Agent fires a cheap verify after every HMR to score the metric | Verify calls that actually changed the fingerprint set |

Also: the SPACE framework literature is unanimous that a single dimension is gameable and that instrumented metrics need a perceptual companion. Add one lightweight, *separately reported* satisfaction signal (a `tracepulse rate` command, or a single thumbs prompt at session end). Keep it strictly out of the objective efficacy claim - METR is the cautionary tale for exactly why perception must never be a substitute for measurement.

---

## 7. Concrete spec deltas

| # | Feature | Change | Priority |
|---|---|---|---|
| D1 | 1 | Replace write-on-clean-shutdown with append-only JSONL event journal + startup compaction (kills survivorship bias) | **P0** |
| D2 | 5 | Add optional local OTLP receiver; consume `claude_code.token.usage`, `claude_code.cost.usage`, `claude_code.active_time`, `tool_result` events; join on session id | **P0** |
| D3 | 5 | Demote the 12x/3x multiplier to a clearly-labelled "estimated (unvalidated model)" fallback used only when the OTel channel is absent | **P0** |
| D4 | New | Error-lifecycle state machine + investigation-episode segmentation (the substrate for everything else) | **P0** |
| D5 | 2 | Every metric returns `{value, n, ci}`; recommendations gated on a minimum-n power threshold | **P1** |
| D6 | New | Precision@5, recall/miss-rate, calibration curve, Brier score for the error scorer; persist per-project recalibration | **P1** |
| D7 | 3 | Swap 40-char prefixes for Drain3-style template mining; rank parser candidates by regret, not frequency | **P1** |
| D8 | New | `holdout_rate` randomised fingerprint holdout (opt-in, off by default) -> first genuinely causal efficacy number | **P1** |
| D9 | 4 | t-digest / DDSketch + log-normal timeout suggestion; condition on cold/warm first-run | **P2** |
| D10 | 1 | Monthly rollups alongside last-100 raw sessions | **P2** |
| D11 | 6 | Pair every steering metric with its guardrail metric (section 6) | **P2** |
| D12 | New | Stamp `tp_version` + `parser_set_hash`; change-point analysis across releases | **P2** |
| D13 | 5 | **Cut CO2/energy from the headline.** Keep it behind a `--verbose` flag if you must, clearly marked as illustrative | **P1** |
| D14 | 1, 2 | **Add `agent` to `SessionEffectivenessRecord`; stratify every cross-session metric by it** (section 5.1). Multi-agent repos are already the norm | **P0** |
| D15 | 1 | Schema shippable-by-construction: counters/ratios only, hashed `project_id`, versioned (section 3.1). Keeps the parked L3 rung a config flag instead of a migration | **P2** |
| D16 | 1, 2, 5 | **`resolved` -> `suppressed` by default; promote to `resolved` only on re-exercise evidence** (section 2.3). Split `fix_rate` into `suppressed_rate` / `confirmed_fix_rate` / `recurrence_rate`; compute `mean_time_to_fix` on confirmed fixes only | **P0** |
| D17 | 1, 2 | Persist open + recently-closed fingerprints across sessions; track `recurred_within_7d` and **retroactively correct** any metric that counted a recurring fingerprint as fixed | **P1** |
| D18 | New | Ship the holdout as an **opt-in, default-OFF, auto-terminating** user-facing experiment with in-the-moment markers and a critical-score safety rail (section 11) | **P1** |

---

## 8. On the CO2 numbers, candidly

`0.34 Wh/1K tokens x 0.4 gCO2/Wh` applied to a *modeled* token saving is an estimate of an estimate of an assumption. It reads as green-washing garnish, and it undermines the metrics next to it that are actually rigorous. Cut it from the headline report. Once D2 lands and real token counts are available from the agent, a *per-repo* energy figure becomes defensible - and per-repo is sufficient for the buyers who actually care, since sustainability reporting is increasingly a procurement criterion and the buyer is accountable for their own footprint, not a vendor's fleet aggregate. So the local-only decision costs nothing here. Earn the number first.

---

## 9. Decisions taken

1. ~~**Where does the aggregation live?**~~ **Decided: local-only for now.** The `.tracepulse/telemetry.json` no-network invariant holds. L3 (cross-project meta-analysis) is parked, not cancelled - see section 3.1 for what to keep cheap so it stays a config change rather than a rewrite when the design partners are ready.
2. ~~**Do multiple agents touch the same repo?**~~ **Confirmed yes** (Kiro + Claude Code). D14 promoted to P0; per-agent tuning moved *in* to scope, reversing Feature 6's Out-of-Scope call.
3. ~~**Which agents actually emit OTel?**~~ **Answered (section 2.1.1): Claude Code yes, Kiro no.** What remains is narrow and scheduled - see the spike brief below.
4. ~~**Is `resolved` really resolved?**~~ **Decided: no, and the schema now says so.** Default outcome is `suppressed`; `resolved` requires re-exercise evidence; `recurred_within_7d` retroactively corrects the books. D16 (P0) and D17 (P1). Section 2.3 has the state machine.
5. ~~**Does the holdout arm need consent?**~~ **Dissolved: the holdout ships as an opt-in, default-OFF, documented feature.** Dogfood internally first, then hand users the switch to run the experiment on their own code. Section 11 has the shipping contract. D18.

---

## 10. Spike brief: Kiro local telemetry surface

**Scope:** 1 day. Blocks D2 (OTel receiver) for Kiro sessions only; does **not** block D2 for Claude Code, so **sequence D2 for Claude Code first and let this spike run in parallel.** Do not hold the P0 block hostage to it.

**Question to answer:** can TracePulse read Kiro's local SQLite session store well enough to produce a *measured* token/cost denominator, or does Kiro fall back to the modeled estimate permanently?

**Tasks:**

1. Locate and schema-dump the Kiro session DB under `~/.kiro/`. Confirm: table names, session identity, token columns (output / cacheWrite / cacheRead), timestamps, workspace or repo path.
2. Verify the input-token approximation. If input tokens really are `chars / 4`, TP gains nothing over its own estimator on the input side - so establish whether the *output* and *cache* counts alone are enough for a defensible ratio. (They may be: cache-read volume is the dominant term in a long agent session, and it is reported accurately.)
3. Determine whether tool invocations are recorded at all. This is the make-or-break item: without per-tool events, **shell-fallback detection for Kiro stays heuristic** and the section 2.2 natural-control-group analysis is Claude-Code-only.
4. Check schema stability. It is an undocumented internal store; a Kiro update can rename a column without warning. Decide the failure mode now: TP must degrade to the modeled estimate silently and stamp `provenance: "estimated"`, never crash and never silently emit a wrong number.
5. Confirm read-only access is safe under an open Kiro process (SQLite WAL, concurrent writer). Copy-then-read if in doubt.

**Decision gate:** if tasks 2 and 3 both come back negative, **do not build the Kiro adapter.** Instead, stamp Kiro sessions `provenance: "estimated"`, exclude them from the efficacy headline, run the L2 holdout on Claude Code sessions only, and revisit if issue #7226 ever ships. A smaller honest number beats a larger uninterpretable one.

**Owner:** unassigned. **Suggested slot:** after D1 + D4 land (the event journal and lifecycle state machine are prerequisites for the adapter to have anywhere to write).

---

## 11. The holdout as a shipped feature (decided)

**Decision: build it, dogfood it on our own repositories first, then ship it to users as an opt-in, default-OFF, documented capability.**

This resolves the consent question by dissolving it. A holdout that the user *switches on themselves, to answer their own question, on their own repo* is not something done to them. It is the feature.

### 11.1 Why this is a feature and not a liability

Every tool in this category asserts its own value. TracePulse would be the one that says: **don't take our word for it - here is the switch, run the experiment yourself, keep the data, we never see it.** The local-only decision (section 9) is what makes that credible rather than a stunt. The number the user gets is theirs, computed on their code, and TracePulse has no way to touch it.

That is a genuinely differentiated position, and it is only available because you took the harder route on the multiplier back in section 1.

### 11.2 The shipping contract

| Requirement | Detail |
|---|---|
| **Default** | OFF. Always. Never flipped on by an update, never on by a "recommended settings" preset. |
| **Activation** | Explicit and local: `holdout_rate` in `.tracepulse/config.json`, or `tracepulse experiment start`. No remote toggle - there is no remote. |
| **Documentation** | A dedicated docs page that leads with what it costs, not what it proves: *"This makes TracePulse deliberately withhold help on ~N% of new errors so you can measure the difference. It will make some investigations slower. That is the point."* |
| **In-the-moment visibility** | Every held-out response is marked (`"TP holdout - investigate manually"`). Non-negotiable, and it applies even when the user turned it on themselves - they should see the experiment running, not just remember enabling it three weeks ago. |
| **Safety rail** | Never hold out a fingerprint above the critical-score threshold. A live production incident is not an experiment. |
| **Kill switch** | `TRACEPULSE_HOLDOUT=0` overrides config, immediately, mid-session. |
| **Termination** | Auto-disable once the pre-registered n is reached (section 3) and surface the result. An experiment that runs forever is not an experiment, it is just a degraded tool. |

The auto-termination row is the one people forget. Ship without it and some user leaves it on for a year, eats a permanent 10% tax, and eventually writes the blog post you do not want.

### 11.3 Dogfooding sequence

1. **Internal repositories first.** No notice needed, no ethics question - we are subject and experimenter both. This is where we find out whether the effect is even large enough to detect, and whether the number is one worth publishing. It may not be. Better to learn that on our own machines.
2. **Design partners**, told plainly, with a yes in writing. They pay in slower investigations and get a causal number for their own repo. Fair trade, openly made.
3. **Public, default-OFF**, on the contract above.

If step 1 produces a disappointing number, that is not a failure of the experiment. It is the experiment doing its job, and it is infinitely cheaper to learn it now than after you have built a GTM narrative on top of a 12x assumption.

---

## 12. Open questions (remaining)

None blocking. Every prior open item is now either decided (section 9) or scheduled (the Kiro telemetry spike, section 10). The next uncertainty of consequence is empirical rather than architectural: **what does the holdout actually say when we run it?** No amount of further design work substitutes for running it.

---

## References

- METR, "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity" and the Feb 2026 study-redesign update: https://metr.org/blog/2026-02-24-uplift-update/
- Claude Code monitoring / OpenTelemetry metrics and events: https://code.claude.com/docs/en/monitoring-usage
- Kiro monitoring and tracking (console dashboard, per-user CSV to S3, CloudTrail/CloudWatch - no local OTel): https://kiro.dev/docs/enterprise/monitor-and-track/
- Kiro configurable telemetry endpoint feature request (open): https://github.com/kirodotdev/Kiro/issues/7226
- `kiro-usage` - reads Kiro's local SQLite session store directly, no network; documents the chars/4 input-token approximation: https://pypi.org/project/kiro-usage/
- OpenTelemetry GenAI semantic conventions (spans, metrics, `execute_tool`, MCP): https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
- Forsgren et al., "The SPACE of Developer Productivity", ACM Queue: https://queue.acm.org/detail.cfm?id=3454124
- Switchback / holdout experiment design for platform features (carryover, sequential testing)
- Drain3 online log template mining; t-digest / DDSketch for streaming quantiles
