# Product Validation: Agent-Driven Development Methodology

## The Convergence Moment

On 2026-04-29, two independent paths arrived at the same solution:

**Path 1 (TracePulse team):** We built a `skills/browser-errors/SKILL.md` that teaches the agent to inject a 15-line error catcher via Chrome DevTools MCP's `evaluate_script`. The catcher POSTs `window.onerror` events to TP's existing log collector on port 9801.

**Path 2 (Agent in the field):** Working on a completely different project, the agent independently hit a `ReferenceError: readOnly is not defined` browser error that TP couldn't see. It analyzed the gap, evaluated three approaches (TP browser SDK, ErrorBoundary reporter, Chrome DevTools MCP), and concluded that adding a `fetch()` call to the project's existing ErrorBoundary to POST to TP's log collector was the quickest win.

**Both paths converged on the same architecture:** browser-side error -> HTTP POST -> TP log collector on port 9801 -> appears in `get_errors`.

Neither path knew about the other. The agent wasn't told about the skill we built. We weren't told the agent would hit this exact error. The convergence validates that the architecture is correct.

---

## The Methodology: How We Build TracePulse

### 1. Ship fast, observe real usage

We don't spec features in isolation. We ship the minimum viable tool, put it in front of a real agent on a real project, and watch what happens.

**Example:** We shipped `get_build_errors` with zero metadata. The agent called it 15 times in one session and complained 3 times that it couldn't tell if the data was fresh. We added `session_started_at`, `oldest_event_at`, `buffer_cleared_at` the same day. The agent confirmed: "the `oldest_event_at` field confirms the buffer is fresh. This addresses my earlier concern."

### 2. Listen to the agent, not just the developer

The agent is our primary user. Its feedback is more actionable than hypothetical user stories because it comes from actual tool usage with real constraints (token budgets, MCP protocol, multi-tool orchestration).

**Example:** The agent asked for `message_contains` filter 3 times before we built it. Once built, it immediately caught a real 500 error on the `/activity` endpoint - something the agent couldn't find by scanning raw logs.

### 3. Build the architecture, let the agent discover the workflows

We build tools and infrastructure. The agent discovers how to combine them into workflows we didn't anticipate.

**Example:** We built `get_new_errors`, `clear_errors`, and `verify_fix` as independent tools. The agent discovered the `get_new_errors -> fix -> clear_errors -> verify_fix` loop on its own and called it "the most productive TP interaction in the entire session." We then documented it as the recommended workflow.

### 4. Predict agent behavior by understanding agent constraints

Agents have specific constraints that predict their behavior:
- **Token budget** -> they want cheap tools first (progressive disclosure)
- **No visual perception** -> they need structured data, not raw text (signal scoring)
- **Stateless sessions** -> they need freshness metadata to know if data is current
- **Multi-tool orchestration** -> they want composite tools that replace 3 separate calls (verify_fix, get_project_health)

Every feature we build addresses one of these constraints.

### 5. The companion model predicts integration patterns

We designed TracePulse as one layer of a three-layer stack (backend + browser + visual). This predicted that:
- The agent would need to route between tools (confirmed: we built the routing guide)
- Browser errors would be a gap (confirmed: the agent hit it twice)
- The solution would involve cross-tool communication (confirmed: browser-side POST to TP's collector)

The three-layer model correctly predicted the integration pattern before the agent encountered the problem.

---

## Evidence of Prediction Accuracy

| What we predicted | When | What happened | When confirmed |
|-------------------|------|---------------|----------------|
| Agents need freshness metadata | Day 1 (design) | Agent asked 3x for "is this data fresh?" | Day 1 (session 1) |
| `get_build_errors` would be the most-used tool | Day 1 (design) | 15x/session, "single biggest time saver" | Day 1 (session 2) |
| Browser errors would be a gap | Day 1 (tool matrix) | Agent hit ReferenceError, TP was blind | Day 2 (session 4) |
| Log collector on 9801 would bridge the gap | Day 1 (Phase 4 design) | Agent independently proposed ErrorBoundary -> POST to TP | Day 2 (session 4) |
| Agents would want composite tools | Day 1 (agent feedback) | Agent asked for verify_fix (3 calls -> 1) | Day 1 (session 3) |
| Signal scoring would drive triage | Day 1 (design) | Agent uses signal_score to prioritize fixes | Day 1 (session 3) |
| Hot-reload detection matters | Day 1 (Phase 2 design) | Agent lost trust when HMR was always false | Day 1 (session 1-3) |
| Pinned errors needed | Day 2 (agent feedback) | Agent hit "error not found" on aged-out error | Day 2 (session 4) |
| Migration errors are a category | Day 2 (infra patterns) | Agent hit 25x "column does not exist" | Day 2 (session 4) |

---

## The Feedback Loop Speed

| Metric | Value |
|--------|-------|
| Average time from agent request to shipped feature | < 30 minutes |
| Features shipped from agent feedback in 24 hours | 20+ |
| Agent wishlist items completed | 21/22 (95%) |
| Features that required architectural changes | 0 (all fit existing architecture) |
| Features the agent discovered workflows for | 3 (debugging loop, browser error bridge, migration fix loop) |

---

## Why This Works

1. **The agent is a better product tester than humans.** It uses tools 15-35 times per session, hits edge cases naturally, and provides structured feedback with exact quotes and suggestions.

2. **The architecture was right from the start.** Every feature request fit into the existing pipeline (parsers, buffer, tools). Zero architectural changes in 24 hours of rapid iteration. This means the Phase 1 design decisions (ring buffer, parser registry, signal scoring, MCP tools) were correct.

3. **The companion model predicted integration needs.** The three-layer stack (TracePulse + Chrome DevTools MCP + ViewGraph) correctly predicted that browser errors would be a gap and that cross-tool communication would be the solution.

4. **Agent-generated configuration is the future.** The agent's insight that "TP config should be agent-generated, not human-written" applies beyond health probes. The agent knows the project better than any config file. Design APIs for agent consumption, not human consumption.
