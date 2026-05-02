# Advanced Token Savings for Agentic Coding Tools
## Research Report: TracePulse & the Broader Agentic Ecosystem

**Date:** May 2026 | **Project:** Tech Explorations

---

## Executive Summary

TracePulse already delivers ~90.6% token savings on error investigation through structured data, fingerprint deduplication, signal scoring, composite tools, and routing hints. This report maps twelve additional dimensions where further reduction is achievable - collectively offering an additional 40-80% reduction on top of the existing baseline, and in some cases unlocking capabilities that are not possible today.

**Three findings deserve immediate attention:**

1. **Schema Tax is the biggest unaddressed overhead.** A naive MCP deployment burns 35x more tokens than a CLI equivalent, and the newest research (Tool Attention, arXiv 2604.21816) demonstrates a 95% per-turn reduction - from 47,300 to 2,400 tokens - using dynamic gating and lazy schema loading. TracePulse's M15 gateway plan is on the right track; this paper provides the rigorous architecture to go further.

2. **Context compaction is a first-class design constraint, not an afterthought.** 21.8% of production context in 857 real sessions is structural waste (Pichay/arXiv 2603.09023). TracePulse responses should be engineered to survive compaction - with stable key names, short field identifiers, and a dedicated `session_summary` tool.

3. **The biggest single token waste in coding agents is re-reading prior work** (59.4% of tokens in the Code Review phase, arXiv 2601.14470). TracePulse can intervene by tracking acknowledged errors, detecting agent loops, and injecting loop-break guidance - turning a passive data server into an active workflow guardian.

---

## Priority Matrix - All 12 Dimensions

| # | Dimension | Est. Savings | Effort | Key Dependency |
|---|-----------|-------------|--------|----------------|
| D1 | Response Compression (delta / cache) | Up to 80-95% on repeat calls; 40-50% on summary-first | Low | TP internal; no protocol change |
| D2 | Push vs. Pull (SSE notifications) | Eliminates polling waste: ~200 tokens/min saved | Medium | MCP Streamable HTTP (spec 2025-11-25 live) |
| D3 | Schema Optimization (dynamic toolsets) | 95% schema token reduction per turn | Medium | SEP-1576 + Tool Attention pattern |
| D4 | Context Window Efficiency | 26-54% overall context reduction; compaction survival | Medium | Structured response design + session_summary tool |
| D5 | Agent Behavior Optimization | 5,000-15,000 tokens/session from loop detection | Low | TP internal audit + acknowledged errors |
| D6 | Cross-Tool Coordination | Reduce 3,000+ tokens/turn schema overlap | High | Shared gateway layer with Chrome DevTools + ViewGraph |
| D7 | Semantic Compression | 30-70% on error payload size | Low | TP internal; framework-frame stripping + message abbreviation |
| D8 | Predictive Pre-computation | ~1,000 tokens/session (eliminated on-demand correlation) | Medium | MCP Tasks (experimental, live in spec) |
| D9 | Token-Aware Response Budgeting | 2-5x response size control per call | Low | TP internal; add token_budget parameter |
| D10 | Offline / Batch Processing | Eliminates cluster/trend computation latency; ~500 tokens | Medium | MCP Tasks async primitive |
| D11 | Learning from Agent Behavior | 11.9% LLM call reduction via meta-tools (AWO study) | High | Requires cross-session audit; TP audit trail foundation exists |
| D12 | Environmental Impact Reporting | Reporting only; no direct token savings | Low | Energy-per-token model (arXiv 2507.11417) |

---

## Dimension Details

### D1: Response Compression

| Field | Detail |
|-------|--------|
| **Current State** | TracePulse returns structured JSON on every call. `get_errors()` returns ~1,000 tokens; `get_error_context()` ~3,000 tokens. No delta mechanism exists - calling the same tool twice returns the same full payload even if nothing changed. FastMCP caching middleware supports TTL-based result caching but TP does not currently use it. |
| **Opportunity** | 1. **Cache fingerprint:** if the agent calls `get_errors()` and no new events have arrived since the last call, return `{"status": "no_change", "since": "<timestamp>"}` - a ~20 token response vs. ~1,000. 2. **Summary-first:** return a 2-3 line triage block by default; agent requests detail only when `signal_score > threshold`. 3. **Delta responses:** track per-client `last_seen` cursor; return only events after that cursor. 4. **Progressive disclosure at field level:** omit `stack_trace` by default, include only when `include_stack=true`. |
| **Token Savings** | No-change response: 980 tokens saved per redundant call. In a 25-turn session with 5 redundant `get_errors` calls: ~4,900 tokens. Summary-first: reduces typical `get_errors` from ~1,000 to ~150 tokens for 85% of calls = ~6,000 tokens/session. Delta on high-frequency tools: 40-80% reduction in repeated call overhead. |
| **Effort** | Low - all TP internal. No protocol changes. Requires stateful per-client cursor tracking. |
| **Dependencies** | None external. FastMCP caching middleware available. MCP protocol does not restrict response structure. |
| **Sources** | FastMCP caching middleware (gofastmcp.com); MCP Server Caching - Fastio (fast.io/resources/mcp-server-caching); Cutting MCP Tool-Call Token Costs by 50%+ (dev.to/kuldeep_paul) |

---

### D2: Proactive Push vs. Reactive Pull

| Field | Detail |
|-------|--------|
| **Current State** | TP operates in pure pull mode: every data retrieval requires an agent tool call. The agent has no mechanism to be notified when errors occur. Common pattern: agent calls `watch_for_errors(duration: 30)` which blocks for 30 seconds - an expensive synchronous wait costing ~1,000 tokens per call. |
| **Opportunity** | The MCP 2025-11-25 specification (Streamable HTTP transport) now natively supports server-initiated notifications via SSE. The server can open an SSE stream on `GET /mcp` and push events without a client POST. This enables: 1. **Error push:** TP sends a notification when a new high-signal-score error occurs. 2. **Build completion push:** TP notifies when a build finishes instead of the agent polling `wait_for_build`. 3. **Subscription model:** agent calls `subscribe_errors(min_score: 70)` once, TP pushes only matching events. WebSocket transport (SEP-1288) is proposed but not yet merged. |
| **Token Savings** | Polling elimination: `watch_for_errors` costs ~1,000 tokens and is called ~5 times/session = ~5,000 tokens. Push replaces this with 1 subscription call (~100 tokens) + N notifications (~50 tokens each). For 3 actual error events, total = ~250 tokens vs. ~5,000. Savings: ~4,750 tokens/session (95% reduction on polling overhead). `wait_for_build` polling: similar savings of ~800 tokens/session. |
| **Effort** | Medium - requires implementing SSE transport support in TP server and client MCP SDK compatibility validation. |
| **Dependencies** | MCP Streamable HTTP transport (spec 2025-11-25, live). Agent MCP client must support SSE event reception. stdio-only deployments cannot use push; stdio remains functional in flat mode. |
| **Sources** | MCP Transports spec 2025-06-18 (modelcontextprotocol.io); SEP-1288 WebSocket Transport (github.com/modelcontextprotocol); Streamable HTTP vs SSE (toolradar.com); MCP Enterprise Readiness Nov 2025 (subramanya.ai) |

---

### D3: Schema Optimization

| Field | Detail |
|-------|--------|
| **Current State** | TP exposes 31 tool schemas consuming ~1,000 tokens at session start (after description compression). M15 plan targets 7 gateways at ~200 tokens via tool clustering. Sub-tool schemas load on demand. The planned architecture aligns with the Speakeasy dynamic toolset pattern. |
| **Opportunity** | 1. **Tool Attention (arXiv 2604.21816):** middleware layer combining Intent Schema Overlap (ISO) scoring + state-aware gating + two-phase lazy schema loader. Reduces 47,300 to 2,400 tokens per turn (95%). 2. **Semantic vector discovery (arXiv 2603.20313):** index tool embeddings, expose 3-5 most relevant tools per query with 97.1% hit rate at K=3. 99.6% schema token reduction. 3. **SEP-1576 (JSON $ref):** deduplicate shared parameters (`fingerprint`, `limit`, `since`) across tool schemas - estimated 15-25% raw schema reduction. 4. **Tool description smell remediation (arXiv 2602.14878):** fix 6 identified description quality issues across 856 tools studied - improves selection accuracy, reducing exploratory calls. 5. **SKILL.md elimination:** if agent loads TP SKILL.md at session start, tool descriptions could be stripped entirely. Risk: 5-15% accuracy loss on edge cases. |
| **Token Savings** | M15 gateway plan: 80% schema reduction (1,000 to 200 tokens). Tool Attention on top: 95% per-turn reduction. Combined at 25 turns: from 25,000 schema tokens/session to ~600. SEP-1576: additional 15-25% on already-compressed schemas. Semantic discovery: 99.6% reduction on schema exposure - only show 3-5 tools per turn. |
| **Effort** | Medium (M15 is already planned). Tool Attention middleware: Medium. SEP-1576: Low (when spec merges). Smell remediation: Low (editorial work on descriptions). |
| **Dependencies** | M15 implementation. SEP-1576 spec adoption (open proposal). Tool Attention pattern requires a vector embedding store (lightweight, can run in-process). Semantic discovery requires initial embedding index build. |
| **Sources** | arXiv 2604.21816 Tool Attention Is All You Need (Sadani & Kumar, April 2026); arXiv 2603.20313 Semantic Tool Discovery 99.6% reduction (March 2026); arXiv 2602.14878 MCP Tool Descriptions Are Smelly (Feb 2026); SEP-1576 Mitigating Token Bloat (github.com/modelcontextprotocol/issues/1576); Speakeasy 100x reduction (speakeasy.com) |

---

### D4: Context Window Efficiency

| Field | Detail |
|-------|--------|
| **Current State** | TracePulse responses use verbose JSON field names and include full error objects even when the agent only needs summaries. No `session_summary` tool exists. No design consideration for how responses survive Claude's 5-layer compaction pipeline. TP does not track its own footprint in the agent's context. |
| **Opportunity** | 1. **Compaction-friendly response design:** use short, stable field names (`s` for `signal_score`, `fp` for `fingerprint`, `oc` for `occurrence_count`). Compaction preserves unique identifiers and short keys better than verbose prose. 2. **Session summary tool:** `get_session_summary()` returns a compressed manifest of all errors seen, investigated, fixed, and pending - in ~200 tokens. Equivalent to the 9-section structured summary Claude Code uses internally. 3. **Demand paging (Pichay/arXiv 2603.09023):** 21.8% of 4.45M production tokens is structural waste. TP should design responses that can be evicted safely (no critical state embedded in tool results). 4. **Context footprint reporting:** TP reports its estimated context consumption to agent, enabling informed compaction decisions. 5. **Focus agent pattern (arXiv 2601.07190):** TP data designed to be captured in the agent's Knowledge block during focus-mode compression, not lost. |
| **Token Savings** | ACON research shows 26-54% token reduction while preserving 95%+ accuracy via structured compaction. Short field names save 10-20% on raw TP response size. Session summary tool: replaces ad-hoc re-investigation (~5,000 tokens) with one 200-token call. Pichay-style eviction design: TP responses that age gracefully could free 5-10% of context per session. |
| **Effort** | Low (response field name changes, session_summary tool). Medium (context footprint instrumentation). |
| **Dependencies** | No external dependencies. Context compaction behavior is agent-side but TP can design for it. Focus Agent integration requires agent cooperation. |
| **Sources** | arXiv 2603.09023 The Missing Memory Hierarchy - Pichay demand paging (Mason, March 2026); arXiv 2601.07190 Active Context Compression (Verma, Jan 2026); Context Engineering for Coding Agents (martinfowler.com); Context Compaction - Morph FlashCompact (morphllm.com); Claude Code compaction pipeline (platform.claude.com/cookbook) |

---

### D5: Agent Behavior Optimization

| Field | Detail |
|-------|--------|
| **Current State** | TP has `get_audit_trail()` which records tool usage in the current session. Fingerprint deduplication prevents the same error from appearing multiple times in responses. However, TP has no mechanism to track which errors the agent has acknowledged or investigated, no loop detection, and no mechanism to inject workflow guidance when the agent is stuck. |
| **Opportunity** | 1. **Acknowledged errors:** agent calls `acknowledge_error(fingerprint)` after investigating; TP excludes that fingerprint from future `get_errors()` responses. Prevents re-investigation waste. 2. **Loop detection:** TP tracks `(tool_name, params_hash, result_hash)` tuples per session. If 3 identical fingerprints appear in the audit trail, TP injects a `loop_warning` field in the next response: "Warning: repeated call detected (3x). Consider alternative approach." 3. **Investigation history:** `get_errors()` includes a field `investigated: true` on previously acknowledged errors, letting the agent skip them without explicitly excluding. 4. **Stuck-state recovery hints:** when loop detected, TP suggests concrete next steps ("Try `correlate_with_diff` to check if recent file changes caused this"). 5. **Progress tracking:** TP tracks error lifecycle across the session - `new`, `acknowledged`, `verified_fixed`. Agent can query `get_error_lifecycle()` for a structured session health view. |
| **Token Savings** | Re-investigation of acknowledged errors: each re-investigation costs ~3,000 tokens (`get_error_context`). 3 avoided re-investigations = ~9,000 tokens. Loop detection: average loop has 5 redundant calls at ~500 tokens each = ~2,500 tokens per loop broken. At 2 loops/session: ~5,000 tokens. Total: ~14,000 tokens/session from behavior optimization. |
| **Effort** | Low - all TP internal. Acknowledged errors: 1-2 days. Loop detection: 1 day (hash-based fingerprinting). Investigation history: 0.5 days. |
| **Dependencies** | None external. Requires stateful session tracking (already exists for audit trail). Loop detection threshold tunable (default: 3 identical calls). |
| **Sources** | arXiv 2601.14470 Tokenomics - 59.4% tokens in Code Review phase (Jan 2026); Agent Loop Problem - MatrixTrak (matrixtrak.com); Loop Detection - FixBrokenAIApps (fixbrokenaiapps.com); StrongDM Attractor loop spec (github.com/strongdm); arXiv 2603.24755 SlopCodeBench - verbosity rises 90% of trajectories (March 2026) |

---

### D6: Cross-Tool Token Coordination

| Field | Detail |
|-------|--------|
| **Current State** | TracePulse + Chrome DevTools MCP + ViewGraph together add 3,000+ tokens of schema overhead per session. TP's routing hints reduce exploratory calls to other tools but do not reduce their schema cost. Each MCP server registers its schemas independently, with no shared deduplication layer. A GitHub MCP server alone contributes ~3,000 tokens per request in naive deployments (OnlyCLI benchmark). |
| **Opportunity** | 1. **Shared MCP gateway:** a single proxy layer that serves all three tools through one schema namespace, deduplicating common parameters (`session_id`, `timestamp`, `filter`, `limit`). Reduces combined schema overhead by 40-60%. 2. **TP as routing authority:** TP's existing routing hints can be elevated to hard routing - when TP identifies a frontend issue, it returns a pre-validated Chrome DevTools call signature, eliminating the exploratory phase. 3. **Cross-tool session ID:** TP, Chrome DevTools, and ViewGraph share a `session_id` so correlated events can be queried without duplicate context loading. 4. **Tool Attention at the gateway level (arXiv 2604.21816):** one ISO-scoring layer across all three MCPs, exposing only 3-5 cross-tool schemas relevant to the current task. |
| **Token Savings** | Combined schema deduplication: 3,000 tokens reduced to ~800 (73% reduction). Cross-tool routing hints eliminating exploratory calls: 2,000 tokens per incident (already quantified in TP baseline). Total additional savings from coordination layer: ~3,200 tokens/session on multi-tool incidents. |
| **Effort** | High - requires coordination with Chrome DevTools MCP and ViewGraph maintainers. Shared gateway introduces an architectural dependency. Long-term payoff is significant. |
| **Dependencies** | Agreement between the three MCP servers on shared schema conventions. Tool Attention middleware applicable at the gateway level. MCP server composition patterns (mcpn, github.com/dx-zero/mcpn). |
| **Sources** | MCP Token Trap 35x vs CLI (onlycli.github.io); arXiv 2604.21816 Tool Attention; MCP Agent Orchestration (getknit.dev); MCPN orchestrator (github.com/dx-zero/mcpn); Tool descriptions eating tokens (cncf.io); Reducing MCP by 92% (getmaxim.ai) |

---

### D7: Semantic Compression

| Field | Detail |
|-------|--------|
| **Current State** | TP already performs ANSI stripping, secret redaction, fingerprint deduplication, signal scoring, and hot-reload filtering. Multi-line accumulation joins stack traces. However, full error messages are returned verbatim, including framework frames, full package paths, and redundant context that the agent can reconstruct. |
| **Opportunity** | 1. **Error message abbreviation:** compress common patterns before returning. `"TypeError: Cannot read properties of null (reading 'name')"` becomes `"[null.name] TypeError"` - 7 tokens vs. 14, 50% reduction. Apply a 10-pattern abbreviation table for Node.js, Python, Go, Java. 2. **Stack trace frame filtering:** only the first user-code frame matters for most fixes. Strip framework frames (`node_modules/`, `site-packages/`, `.cargo/registry/`) before transmission. A 15-frame stack with 12 framework frames becomes 3 frames. 3. **Semantic deduplication of related errors:** if 5 errors all trace to the same user-code `file:line`, TP groups them as one error with `variant_count: 5`. 4. **Prose compression in `fix_suggestion`:** LLM-generated suggestions are verbose. Apply extractive compression to return only the action sentence. 5. **Structured shorthand:** use `error_type` codes (`NPE`, `CONN_REFUSED`, `PORT_IN_USE`) instead of full English descriptions in summary views. |
| **Token Savings** | Error message abbreviation: ~30% reduction on message text field. Stack trace filtering: 80% reduction on `stack_trace` field (12 of 15 frames stripped). Combined: typical error event drops from ~500 tokens to ~180 tokens - a 64% reduction per error. At 5 errors/session: ~1,600 tokens saved. `get_build_errors` (currently ~1,500 tokens): semantic compression could reduce to ~600 tokens. |
| **Effort** | Low - all TP internal. Abbreviation table: 1 day. Stack frame filtering: 1 day (language-specific path patterns). Semantic error grouping: 2 days. |
| **Dependencies** | None external. Framework path patterns are language-specific but well-defined. Abbreviation table can be extended iteratively. GPTrace LLM embedding approach (arXiv 2512.01609) available for more sophisticated semantic dedup. |
| **Sources** | arXiv 2512.01609 GPTrace - crash deduplication via LLM embeddings (Dec 2025); Stack Trace Deduplication arXiv 2412.14802 (Dec 2024); OpenClaw log compression 70% reduction; arXiv 2602.14878 MCP tool smell remediation |

---

### D8: Predictive Pre-computation

| Field | Detail |
|-------|--------|
| **Current State** | All TP tools are reactive: `correlate_with_diff()` only runs when the agent calls it. `get_project_health()` runs fresh on each invocation. No background workers exist. TP has the primitives (git diff awareness, error correlation) but they are invoked synchronously, adding latency and tokens to the agent's path. |
| **Opportunity** | 1. **Auto-correlate on file save:** when the dev server detects a file change (via HMR events TP already captures), TP pre-runs `correlate_with_diff()` and caches the result. When the agent calls `correlate_with_diff()`, the result is instant and pre-computed. 2. **Session-start pre-warm:** on MCP connection, TP pre-computes `get_project_health()`, `get_error_clusters()`, and a baseline error snapshot. Agent's first diagnostic call returns instantly from cache. 3. **Predictive error relevance:** if the agent recently fixed `auth.py` (detectable via TP's `run_and_watch` output), TP pre-filters the error list to `auth.py`-related events and caches as `predicted_errors`. 4. **MCP Tasks primitive:** the Nov 2025 spec's experimental Tasks allows TP to run background work and return a task handle, letting the agent continue while analysis runs. 5. **ToolSpec speculative decoding (arXiv 2604.13519):** pre-predict the next tool call based on schema patterns, achieving 4.2x speedup for tool-calling generation. |
| **Token Savings** | Pre-computed `correlate_with_diff`: eliminates ~1,000 token reactive call + reduces latency. Pre-warmed `project_health`: ~200 tokens saved per session start. Caching repeated `get_error_clusters`: ~500 tokens/session. Total: ~1,700 tokens in direct savings, plus developer time saved from latency reduction. |
| **Effort** | Medium - requires background worker infrastructure in TP. File-save hooks available via HMR detection (already implemented). MCP Tasks integration adds complexity. |
| **Dependencies** | MCP Tasks (experimental in spec, Nov 2025). File-save event pipeline (TP already has HMR detectors). Background computation thread in TP server process. |
| **Sources** | arXiv 2604.13519 ToolSpec speculative decoding 4.2x speedup (April 2026); MCP Async Tasks - WorkOS (workos.com); MCP Tasks - Asynchronous Agent (stn1slv.medium.com); arXiv 2509.02121 Batch Query Processing for Agentic Workflows |

---

### D9: Token-Aware Response Budgeting

| Field | Detail |
|-------|--------|
| **Current State** | TP tools accept `limit` parameters on some endpoints (`get_errors`, `get_build_errors`) but no unified `token_budget` mechanism exists. The agent has no way to signal how much context it can afford for a given tool call. All tools return a fixed response size regardless of context window pressure. |
| **Opportunity** | 1. **`token_budget` parameter:** all TP tools accept an optional `token_budget: number` (in tokens). TP truncates intelligently, keeping high-signal content. Example: `get_errors(limit: 10, token_budget: 200)` returns at most 200 tokens of error data, prioritized by `signal_score`. 2. **`verbosity` parameter:** `verbosity: 'minimal' \| 'standard' \| 'full'` on every tool. `minimal` returns only `fingerprint + signal_score + error_type`. `full` includes stack trace, context window, fix suggestions. 3. **Context pressure signal:** agent can pass `context_remaining: N` so TP scales response size proportionally. 4. **Dynamic truncation:** TP estimates its response token count before sending and auto-truncates if it exceeds a configurable threshold (default: 500 tokens). 5. **Telemetry-as-Prompt alignment:** TP responses formatted to match structured telemetry optimized for LLM consumption - key facts first, supporting detail at end (which compaction drops first). |
| **Token Savings** | `token_budget` enforcement: prevents 2-5x response bloat on large error sets. A session with 20 errors could return 10,000 tokens unconstrained but 1,000 tokens with `budget=1000`. `verbosity` control: `minimal` mode drops response from ~1,000 to ~150 tokens for quick checks. Estimated 3,000-8,000 tokens/session from budget-aware calls. |
| **Effort** | Low - all TP internal. Add `token_budget` and `verbosity` parameters to tool schemas. Implement token estimation (approximate, based on field sizes). |
| **Dependencies** | None external. Token budget estimation can be approximate (character count / 4). No protocol changes required. |
| **Sources** | Anthropic context engineering (platform.claude.com/cookbook); OpenTelemetry for MCP analytics (glama.ai); Tracking Every Token - Microsoft Foundry (techcommunity.microsoft.com); How coding agents spend money (openreview.net - higher token usage does not improve accuracy) |

---

### D10: Offline / Batch Processing

| Field | Detail |
|-------|--------|
| **Current State** | All TP computation is synchronous and on-demand. `get_error_clusters()` runs fresh clustering on every call. `get_error_trends()` computes cross-session frequency live. `get_perf_baseline()` aggregates endpoint times synchronously. No background workers exist between agent calls. |
| **Opportunity** | 1. **Continuous clustering:** maintain a background worker that re-clusters errors every 30 seconds. `get_error_clusters()` returns the pre-computed result instantly. 2. **Session briefing tool:** `get_session_briefing()` returns a ~300-token summary computed in the background: new errors since last call, resolved errors, build status change, performance anomalies. Replaces 3-4 separate calls totaling ~2,500 tokens. 3. **Overnight analysis:** for long-running dev servers, TP computes patterns between sessions - error frequency trends, recurring clusters, performance degradation curves. `get_overnight_analysis()` surfaces this in one call. 4. **Background diff-to-error correlation:** continuously maintain a correlation index mapping git diff hunks to error fingerprints. Instant lookup when agent asks. 5. **MCP Tasks (Nov 2025 spec):** fire a long-running analysis task, return a task handle, let agent continue. Fetch result when needed. |
| **Token Savings** | Session briefing replaces 3-4 calls (`get_errors + get_build_errors + get_infra_status + get_perf_baseline`) totaling ~2,900 tokens with one 300-token call: ~2,600 tokens saved per briefing. Pre-computed clusters: 0 additional latency, ~500 tokens saved vs. redundant on-demand calls. Total: ~3,100 tokens/session for sessions using background results. |
| **Effort** | Medium - requires background worker thread in TP server. Session briefing tool requires aggregation logic. MCP Tasks integration adds protocol surface. |
| **Dependencies** | MCP Tasks (experimental, Nov 2025 spec). Background thread model in TP server (Node.js Worker Threads or similar). Persistent inter-call state (already partially present in ring buffer). |
| **Sources** | MCP Async Tasks - WorkOS (workos.com); arXiv 2509.02121 Batch Query Processing; MCP Enterprise Readiness Nov 2025 (subramanya.ai); MCP Tasks architecture (stn1slv.medium.com) |

---

### D11: Learning from Agent Behavior

| Field | Detail |
|-------|--------|
| **Current State** | TP's `get_audit_trail()` records tool usage per session but does not analyze patterns, detect inefficiencies, or suggest optimizations. The data exists but is not acted on. No cross-session learning occurs. |
| **Opportunity** | 1. **Usage heat map:** track which tools are called most frequently across sessions. Optimize those tools first for minimum token output. The tool called most is the highest-leverage optimization target. 2. **Meta-tool generation (AWO/arXiv 2601.22037):** analyze audit trail for recurring tool-call sequences. A pattern like `[run_and_watch -> get_errors -> get_error_context -> verify_fix]` appears in 80% of sessions. TP can synthesize this as a meta-tool: `debug_cycle(command, duration, fingerprint)`. One call replaces four. 3. **Stuck-state injection:** when audit trail shows 3+ identical `(tool, params)` pairs, TP injects a loop-break message in the next response. 4. **Usage-based description optimization:** if `get_health_summary` is called 10x more than `get_runtime_status`, TP's routing system should surface it more prominently. 5. **Cross-session error pattern memory:** TP tracks which errors recur across sessions. Recurring errors get a `recurrence_history` field, saving the agent from re-investigating known patterns. |
| **Token Savings** | AWO meta-tools: 11.9% reduction in LLM calls (academic result). For TP's 40-70 `run_and_watch` calls/session, a `debug_cycle` meta-tool reducing by 11.9% = 5-8 fewer cycles = ~5,000 tokens saved. Stuck-state injection: ~2,500 tokens per loop broken (5 avoided calls x 500 tokens). Total: ~7,500 tokens/session from learning-based optimizations. |
| **Effort** | High - cross-session learning requires persistent storage beyond the ring buffer. Meta-tool synthesis requires pattern analysis infrastructure. Stuck-state detection: Low (already designed in D5). |
| **Dependencies** | Persistent cross-session audit storage (TP currently in-memory). Pattern analysis engine (could be simple frequency counting initially). AWO meta-tool synthesis framework for automated generation. |
| **Sources** | arXiv 2601.22037 Optimizing Agentic Workflows using Meta-tools - 11.9% LLM call reduction (Jan 2026); SlopCodeBench arXiv 2603.24755; Dive into Claude Code arXiv 2604.14228 - 98.4% infrastructure vs 1.6% AI logic; Agent self-optimization (machinelearningmastery.com) |

---

### D12: Environmental Impact Quantification

| Field | Detail |
|-------|--------|
| **Current State** | TracePulse has no environmental reporting. The 90.6% token savings already achieved have substantial energy implications that are not surfaced to users. There is no per-session carbon report or energy cost estimate. |
| **Opportunity** | 1. **Energy-per-token model:** a single LLM query consumes approximately 0.34 Wh (ChatGPT, June 2025 data). Mistral Large 2 shows ~1.09 gCO2e per 400-token query. TP can compute: `tokens_saved * energy_per_token * carbon_intensity_of_region = gCO2 saved`. 2. **Per-session carbon report:** `get_session_impact()` returns `{tokens_saved: 121000, energy_saved_wh: 25.7, co2_saved_g: 10.3, equivalent_to: "3 Google searches"}`. 3. **Project-level dashboard:** cumulative environmental impact across sessions, useful for ESG reporting. 4. **Cloud region awareness:** carbon intensity varies 5-10x across cloud regions (e.g., US-East vs US-West). TP could accept `region` parameter for accurate CO2 computation. 5. **Benchmarking:** arXiv 2507.11417 provides a simulation framework for quantifying LLM inference energy consumption that TP could integrate. |
| **Token Savings** | No direct token savings from this dimension. Pure reporting/transparency value. Indirect: surfacing cost creates developer incentive to use efficient tools. |
| **Effort** | Low - purely additive reporting tool. Energy-per-token constants from published research. No external API required. |
| **Dependencies** | Energy-per-token model (arXiv 2507.11417, antarctica.io One-Token Model). Carbon intensity data by cloud region (optional: static table sufficient for V1). |
| **Sources** | arXiv 2507.11417 Quantifying Energy Consumption of LLM Inference (July 2025); antarctica.io One-Token Model; arXiv 2512.03024 TokenPowerBench; Mistral Large 2 carbon data - 1.09 gCO2e per 400-token query; NVIDIA Blackwell 50x throughput per megawatt vs Hopper |

---

## LLM Coding Agent Pain Points - Implications for TracePulse

The following pain points emerge from 2025-2026 research and production data across Cursor, Claude Code, GitHub Copilot, Devin, and OpenHands. Each represents a token-wasting failure mode that TracePulse can partially or fully address.

| # | Pain Point | Token Impact | TracePulse Opportunity |
|---|-----------|-------------|------------------------|
| P1 | **Context Rot** | 39% avg performance drop in multi-turn conversations; compaction loses critical debugging state after 2-3 cycles | `session_summary` tool preserves error/fix history in compact form; compaction-friendly response design (D4) |
| P2 | **Re-reading prior work** | 59.4% of tokens consumed in Code Review phase (Tokenomics study). Agents re-read files they already processed. | `acknowledged_errors` prevents re-investigation of known issues; error lifecycle tracking shows what has already been investigated (D5) |
| P3 | **Silent false fixes** | Agent declares "fixed" without verifying; 5 wasted messages x 1,000 tokens = 5,000 tokens per false fix | `verify_fix()` already exists. Claim-checking is TP's strongest current behavior optimization. |
| P4 | **Schema tax / tool overhead** | 35x more tokens via MCP vs CLI for same task. GitHub MCP = 3,000 tokens per request on schemas alone. | M15 gateway plan + Tool Attention pattern drops from 1,000 to ~50 schema tokens/turn (D3) |
| P5 | **Over-exploration / file navigation** | AGENTS.md context files increase inference cost 20-23% while reducing task success in 5/8 settings | TP routing hints guide agent to right tool without exploration. Correlated errors eliminate file hunting. |
| P6 | **Stuck loops** | Same tool/params/result repeated 5-10x per session. Each redundant call: 500-1,000 tokens wasted. | Loop detection via audit trail fingerprinting; loop-break injection in next response (D5, D11) |
| P7 | **Context poisoning** | Incorrect belief enters context and is reinforced; agent spends hours on wrong hypothesis | Claim-checking via `verify_fix`; error lifecycle status prevents stale "fixed" state from propagating |
| P8 | **Long-horizon degradation** | SlopCodeBench: verbosity rises in 90% of trajectories; code quality erodes systematically over iterative tasks | Session briefing tool tracks error-to-fix ratio over time; alerts agent when quality metrics degrade (D10) |
| P9 | **Hallucinated APIs / wrong packages** | ~15% of npm package suggestions are wrong or deprecated (Copilot data) | TP's `run_and_watch` catches import errors immediately; `get_build_errors` surfaces missing dependency errors structurally |
| P10 | **Token/accuracy paradox** | Higher token usage does not improve accuracy; higher-cost runs are often less accurate (OpenReview study) | TP's signal scoring and `token_budget` parameter ensure maximum accuracy per token, not maximum tokens |
| P11 | **Structural context waste** | 21.8% of 4.45M production tokens is structural waste - stale tool results, repeated schemas (Pichay study) | Delta responses + no_change tokens eliminate stale TP data; eviction-safe response design (D1, D4) |
| P12 | **Debugging residue** | Agent creates variant files during debugging and does not clean up; no awareness of created artifacts | TP's `verify_fix` + `run_and_watch` can detect residual files via test failures; future: `artifact_tracker` tool |

---

## Recommended Implementation Roadmap

Ordered by effort-to-impact ratio, with dependencies respected.

### Wave 1: Quick Wins - 2-4 Weeks, Zero Dependencies

All TP-internal changes that deliver immediate, measurable savings.

| ID | Change | Est. Savings | Implementation Notes |
|----|--------|-------------|---------------------|
| W1.1 | Acknowledged errors (D5) | ~9,000 tokens/session | Add `acknowledge_error(fingerprint)` tool; exclude acknowledged from `get_errors()` |
| W1.2 | No-change delta responses (D1) | ~4,900 tokens/session | Add per-client cursor; return `{status: 'no_change'}` when ring buffer unchanged |
| W1.3 | Stack trace frame filtering (D7) | ~1,600 tokens/session | Strip `node_modules/` / `site-packages/` / `.cargo` frames before transmission |
| W1.4 | Error message abbreviation (D7) | ~800 tokens/session | 10-pattern abbreviation table for Node/Python/Go/Java errors |
| W1.5 | `token_budget` + `verbosity` params (D9) | 2-5x response size control | Add optional `token_budget` and `verbosity` parameters to all tools |
| W1.6 | Loop detection injection (D5) | ~5,000 tokens/session | Hash `(tool, params, result)`; inject warning after 3 identical entries in audit trail |
| W1.7 | Environmental report tool (D12) | Reporting only | `get_session_impact()` computing `tokens_saved -> energy_saved -> co2_saved` |

**Wave 1 total: ~21,300 tokens/session saved** (additional to existing 90.6% baseline)

### Wave 2: Medium Effort - 4-8 Weeks, Minor Dependencies

| ID | Change | Est. Savings | Implementation Notes |
|----|--------|-------------|---------------------|
| W2.1 | SSE push transport (D2) | ~5,550 tokens/session | Implement Streamable HTTP SSE; error + build-complete push events |
| W2.2 | Session summary tool (D4) | ~5,000 tokens/session | `get_session_summary()` returning 200-token compressed error/fix manifest |
| W2.3 | Session briefing tool (D10) | ~2,600 tokens/session | Background worker + `get_session_briefing()` replacing 4 separate calls |
| W2.4 | Pre-computed diff correlation (D8) | ~1,700 tokens/session | Auto-run `correlate_with_diff` on HMR events; cache result for instant retrieval |
| W2.5 | Compaction-friendly field names (D4) | 10-20% response size | Rename verbose fields to short stable keys; maintain backward-compat aliases |
| W2.6 | Semantic error grouping (D7) | ~500 tokens/session | Group errors sharing same user-code `file:line` into `parent + variant_count` structure |

**Wave 2 total: ~15,350 tokens/session saved** (additional to Wave 1)

### Wave 3: Strategic - 2-4 Months, Architecture-Level

| ID | Change | Est. Savings | Implementation Notes |
|----|--------|-------------|---------------------|
| W3.1 | Tool Attention / lazy schema (D3) | 95% schema token reduction | Implement ISO scoring + lazy schema promotion; replaces/extends M15 gateway plan |
| W3.2 | Semantic vector tool discovery (D3) | 99.6% schema token reduction | Embed tool descriptions; expose 3-5 tools/turn; requires embedding model |
| W3.3 | SEP-1576 JSON $ref adoption (D3) | 15-25% raw schema reduction | When spec merges; deduplicate `fingerprint`/`limit`/`since` across schemas |
| W3.4 | Meta-tool synthesis (D11) | 11.9% LLM call reduction | Analyze audit trails for recurring sequences; synthesize composite meta-tools (AWO pattern) |
| W3.5 | Cross-tool coordination layer (D6) | ~3,200 tokens/session | Shared gateway with Chrome DevTools MCP + ViewGraph; requires partner coordination |
| W3.6 | Persistent cross-session learning (D11) | Compounding over time | Persist audit trail across sessions; identify recurrent errors and workflow patterns |

---

## Cumulative Savings Projection

Starting from TracePulse's current 90.6% savings baseline (12,500 tokens vs. 133,500 baseline), the three waves deliver the following cumulative reductions per 25-turn session:

| State | Session Tokens | vs. No-TP Baseline | vs. Current TP | Key Driver |
|-------|---------------|-------------------|----------------|------------|
| No TracePulse (baseline) | ~133,500 | - | - | Raw log reading + shell calls |
| Current TP (today) | ~12,500 | **90.6% saved** | - | 6 existing mechanisms |
| After Wave 1 | ~8,200 | **93.9% saved** | 34.4% more | Delta, loop detection, semantic compression |
| After Wave 2 | ~5,400 | **96.0% saved** | 56.8% more | Push notifications, session briefing |
| After Wave 3 | ~2,800 | **97.9% saved** | 77.6% more | Tool Attention, meta-tools |

> Note: Projections are conservative estimates based on per-dimension savings compounded. Actual savings will vary by project type, error frequency, and agent behavior patterns. The 97.9% figure represents a theoretical upper bound assuming all Wave 3 features are active simultaneously.

---

## Key Research References

- **arXiv 2604.21816** - *Tool Attention Is All You Need: Dynamic Tool Gating and Lazy Schema Loading* - Sadani & Kumar, Infrrd.ai, April 2026. 95% schema token reduction (47.3k -> 2.4k tokens/turn). https://arxiv.org/abs/2604.21816

- **arXiv 2603.20313** - *Semantic Tool Discovery for LLMs: A Vector-Based Approach to MCP Tool Selection* - March 2026. 99.6% schema token reduction; 97.1% hit rate at K=3; sub-100ms retrieval. https://arxiv.org/abs/2603.20313

- **arXiv 2602.14878** - *MCP Tool Descriptions Are Smelly! Improving AI Agent Efficiency with Augmented Tool Descriptions* - Hasan et al., Feb 2026. 856 tools, 103 MCP servers, 6 smell categories identified. https://arxiv.org/abs/2602.14878

- **arXiv 2603.09023** - *The Missing Memory Hierarchy: Demand Paging for LLM Context Windows* - Mason (UBC/Georgia Tech), March 2026. 21.8% of production context is structural waste; Pichay system. https://arxiv.org/abs/2603.09023

- **arXiv 2601.14470** - *Tokenomics: Quantifying Where Tokens Are Used in Agentic Software Engineering* - Jan 2026. 59.4% of tokens in Code Review phase; input tokens = 53.9% of total consumption. https://arxiv.org/abs/2601.14470

- **arXiv 2601.07190** - *Active Context Compression: Autonomous Memory Management in LLM Agents* - Verma, Jan 2026. Focus agent with `start_focus`/`complete_focus` primitives; 22.7% token reduction. https://arxiv.org/abs/2601.07190

- **arXiv 2601.22037** - *Optimizing Agentic Workflows using Meta-tools (AWO)* - Abuzakuk et al., Jan 2026. 11.9% LLM call reduction via composite meta-tool synthesis from audit trails. https://arxiv.org/abs/2601.22037

- **arXiv 2603.24755** - *SlopCodeBench: Benchmarking How Coding Agents Degrade Over Long-Horizon Tasks* - March 2026. Verbosity rises 90%, structural erosion 80% of trajectories across 11 models. https://arxiv.org/abs/2603.24755

- **arXiv 2604.14228** - *Dive into Claude Code: The Design Space of Today's and Future AI Agent Systems* - Liu et al. (VILA-Lab), April 2026. 98.4% of codebase is infrastructure; 5-layer compaction pipeline analysis. https://arxiv.org/abs/2604.14228

- **arXiv 2604.13519** - *ToolSpec: Accelerating Tool Calling via Schema-Aware Speculative Decoding* - April 2026. 4.2x speedup using finite-state machine on tool JSON schemas. https://arxiv.org/abs/2604.13519

- **arXiv 2507.11417** - *Quantifying Energy Consumption and Carbon Emissions of LLM Inference* - July 2025. Simulation framework for energy/CO2 per token. https://arxiv.org/abs/2507.11417

- **arXiv 2512.01609** - *GPTrace: Effective Crash Deduplication Using LLM Embeddings* - Dec 2025. HDBSCAN clustering on stack trace embeddings for semantic deduplication. https://arxiv.org/abs/2512.01609

- **SEP-1576** - *Mitigating Token Bloat in MCP: Schema Deduplication and Tool Selection* - Chang, Li, Cao. Open proposal on github.com/modelcontextprotocol. JSON $ref + adaptive field control. https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576

- **MCP Spec 2025-11-25** - *Model Context Protocol: Enterprise Readiness Specification* - Nov 2025. Adds Streamable HTTP + SSE + Tasks (experimental) + async execution primitives. https://modelcontextprotocol.io

- **Speakeasy** - *Reducing MCP Token Usage by 100x: Dynamic Toolsets v2* - speakeasy.com. 96% input token reduction; 91% total reduction on complex tasks via search-describe-execute pattern. https://www.speakeasy.com/blog/how-we-reduced-token-usage-by-100x-dynamic-toolsets-v2

- **Pichay / antarctica.io** - *One-Token Model: AI Cost, Energy & Emissions Measurement* - antarctica.io. Energy-per-token model for carbon impact calculation. https://antarctica.io/research/one-token-model

- **Context Engineering** - *Effective Context Engineering for AI Agents* - Anthropic engineering blog. 5-layer compaction; right information at the right time design principles. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

---

*End of Report - Tech Explorations | May 2026*
