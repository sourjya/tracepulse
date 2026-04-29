# Marketing USPs - Extracted from Ecosystem Research

## Token Efficiency USPs

**USP-1: "Agents spend 60-80% of tokens on orientation, not problem-solving"**
> Research from Morph (2026), Cognition, and SWE-Pruner (arXiv 2601.16746): agents burn 12,000 tokens reading 25 files to answer a question that needed 800 tokens from 3 files.
> TracePulse: one `get_errors()` call returns the exact file:line in ~1,000 tokens.

**USP-2: "26% reduction in agent interaction rounds with focused context"**
> TracePulse's signal scoring, fingerprint dedup, and progressive disclosure compress 42 occurrences of the same error into one actionable line.

**USP-3: "Composite tools save 3x token spend"**
> `verify_fix` replaces 3 separate calls. `get_project_health` replaces 4. Each saves ~2,000 tokens per invocation.

## Trust & Reliability USPs

**USP-4: "One unexplained empty response destroys trust in an entire tool"**
> Documented pattern: agent abandoned `get_correlated_errors` after one unexplained `[]`. TracePulse's why-empty diagnostics prevent tool abandonment.

**USP-5: "80% of developers use AI coding agents, but trust dropped from 40% to 29%"**
> (Bunnyshell 2026) TracePulse's signal scoring and structured responses build agent trust through transparency.

## Competitive Positioning USPs

**USP-6: "No other tool monitors the backend at dev time"**
> Every competitor (Chrome DevTools MCP, BrowserTools, Playwright MCP) is browser-first. Sentry is production-first. TracePulse is the only dev-time backend tool.

**USP-7: "Agents are blind to 6 categories of background state"**
> Port occupancy, env completeness, dependency sync, migration state, worker health, test outcomes. TracePulse covers 5 of 6 today.

**USP-8: "The worst agent failures are silent"**
> Agent quietly stops doing part of the work and nobody notices. TracePulse's audit trail and proactive monitoring surface what agents miss.

## Real-World Proof Points

**USP-9: "Feature requested -> shipped -> caught real bug, same day"**
> `message_contains` filter: requested by agent, built in 30 min, caught a 500 error on `/activity` endpoint within hours.

**USP-10: "25 migration-not-applied errors caught in one call"**
> `get_new_errors` surfaced "column auth_provider does not exist" - invisible to compile-time tools. Fixed in under 2 minutes.

**USP-11: "Two independent paths converged on the same architecture"**
> TP team and agent independently arrived at browser error -> HTTP POST -> log collector. Validates the architecture is correct.
