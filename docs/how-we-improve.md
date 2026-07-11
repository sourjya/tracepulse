# How We Improve TracePulse

*Last updated: 2026-07-11*

TracePulse is used across a fleet of production projects (Python backends, TypeScript frontends, Go services, Rust CLIs). This document is an honest account of what we got wrong, what we learned from the field, and how we're fixing it. It's an engineering postmortem, not a product page.

---

## The Friction Gradient Discovery

**What we believed:** If we wrote clear steering files telling agents to use `run_and_watch` instead of `shell`, they would comply.

**What actually happened:** 30+ documented shell-fallback violations across 5 projects over 3 weeks. Each violation was attributed to "agent behavioral failure" and met with escalating documentation: bold text, capitalization, "STRUCTURAL GATE" labels, mandatory blocks. None of it worked.

**The root cause (found 2026-07-08):** The agent was not disobeying. It *could not obey*. Four independent defects, each sufficient on its own:

1. The mandated tool didn't exist in the session (MCP not registered)
2. The steering file was never read (Claude Code doesn't load `.kiro/steering/`)
3. The gate named the wrong tool (`shell` vs `Bash`)
4. The banned command was pre-approved in settings

The real law:

> **Agents follow the friction gradient, not the prose.** A tool with zero friction (auto-approved, no prompts) will always be preferred over a tool that interrupts for permission, regardless of how many steering files say otherwise.

**What we're doing about it:**
- `tracepulse init` now ships a full `autoApprove` list for all 42 TracePulse tools (shipped 2026-07-11)
- This means `run_and_watch`, `get_errors`, `verify_fix`, `start_server` etc. all run without interrupting for permission — matching shell's zero-friction behavior
- Claude Code gets a `PreToolUse` deny hook that blocks Bash for test/build/lint patterns
- Deny hooks must name the concrete replacement with arguments
- We're measuring this: the M27 effectiveness telemetry will track `shell_misuse_count` per session and trend it over time

**Lesson:** Steering is soft context. Hooks are hard infrastructure. Invest in infrastructure.

---

## The Discoverability Gap

**What we shipped:** In v0.9.22, we added automatic virtualenv activation to `run_and_watch`. When a `.venv/` directory exists in the working directory, TracePulse prepends it to PATH. So `run_and_watch("pytest tests/", cwd: "./backend")` just works — no `bash -c`, no `.venv/bin/` prefix needed.

**What agents in the field believe (as of today):** "For this Python project with a venv, `run_and_watch` cannot execute pytest directly. Shell is the ONLY option."

That was written in a chokepoint log *today* (2026-07-11). The feature has existed for weeks. Nobody knows.

Same pattern with the expanded allowlist: `python`, `python3`, `pytest`, `.venv/bin/`, `uv` were added to the base allowlist in CIQ-605. But steering files across the fleet still say the old list. Agents try the old patterns, get rejected, conclude the tool can't do it, fall back to shell.

**What we're doing about it:**
- When `run_and_watch` rejects a command, the error message now includes relevant allowed prefixes
- When venv auto-activation is used, we'll log it to stderr so agents know it happened
- All shipped steering files updated (this session) to remove the false "up to 120" timeout cap
- `tracepulse init` will regenerate steering in all consumer projects

**Lesson:** A feature that nobody discovers is a feature that doesn't exist. Discoverability is part of the implementation, not a separate docs task.

---

## Guard Hook Fragility

**What we built:** A `PreToolUse` Bash deny hook that blocks commands matching test/build patterns (vitest, pytest, tsc, etc.).

**What broke:** The hook matched those patterns inside heredoc bodies, commit messages, and Python fixture strings. Writing a commit message that said "verified via vitest" was denied. Writing a chokepoint log entry *about* vitest was denied. The hook couldn't tell code from data.

**The pattern:** A guard that cannot distinguish intent from mention will eventually block the very work it exists to protect. And the pressure to add a blanket bypass is exactly how guards die.

**What we're doing about it:**
- All shipped deny hooks strip heredoc bodies and quoted spans before pattern matching
- Every hook ships with test cases including "mention-not-invocation" scenarios
- Rejection messages identify which span triggered the deny

**Lesson:** False positives are more dangerous than false negatives. A false negative loses one defense. A false positive invites removing the whole guard.

---

## HMR Detection Gaps (Python Backends)

**What we claim:** TracePulse detects hot-reload events from 8 dev tools including uvicorn and Django.

**What the field data shows:** 4 separate feedback entries reporting `hot_reload_detected: false` when uvicorn demonstrably reloaded. Agents see "zero events, no HMR detected" and lose trust in the tool.

**What's happening:** The uvicorn reload detection works for some output formats but not all. Structlog-formatted output, custom formatters, and attach-mode setups may not match our regex patterns.

**What we're doing about it:**
- Auditing all uvicorn/Django output format variants
- In attach mode, `hot_reload_detected` will return `null` (unknown) instead of `false` (definitely no) — an important semantic distinction
- Adding Django's "Watching for file changes" pattern

**Lesson:** Claiming detection coverage without testing all format variants is a reliability debt that erodes trust. Better to say "unknown" than to say "no" when you're not sure.

---

## The Multiplier Honesty

**What we shipped:** `get_session_impact` reports "estimated 12x token savings for error tools, 3x for other tools." The README says "fewer wasted tokens."

**What that actually is:** A tool grading its own homework with a rubric it wrote. The 12x multiplier was based on reasonable estimates (manual log reading ≈ 12,000 tokens per error investigation vs TracePulse ≈ 1,000 tokens), but:

1. It's applied to a counterfactual TracePulse never observed
2. The METR study found developers were 19% *slower* with AI tooling while *believing* they were 20% faster
3. A skeptical engineering manager asking "measured how?" gets the honest answer "we assumed it"

**What we're doing about it:**
- Demoting the multiplier to a clearly-labeled "estimated (unvalidated model)" fallback
- Building a local OTLP receiver to consume Claude Code's real token/cost telemetry
- Designing a randomised fingerprint holdout experiment (opt-in, off by default) that produces genuinely causal efficacy numbers
- Per-session effectiveness tracking with confirmed-fix rates (not just "fingerprint disappeared")
- The goal: "TracePulse reduced tokens-to-fix by 4.1x (95% CrI 2.8-6.0) measured by randomised holdout on your repo" — that sentence sells the product. "We assume 12x" does not.

**Lesson:** Honest measurement, even when the number is smaller, is worth infinitely more than a flattering estimate. Earn the number first.

---

## How Feedback Reaches Us

TracePulse runs locally. We have no telemetry backend, no usage analytics, no network calls home. Every finding in this document came from:

1. **Chokepoint logs** — each project maintains `docs/engineering/chokepoint-log.md` documenting errors that required multiple fix attempts
2. **Agent feedback log** — `docs/feedback/agent-feedback-log.md` in the TracePulse repo, with inline assessments after every tool call
3. **Structured tickets** — bug/feature tracking across the fleet
4. **Session handover documents** — end-of-session state dumps that capture what worked and what didn't

This is labor-intensive and unscaled. M27 (Effectiveness Telemetry) will automate much of this by persisting session metrics locally in `.tracepulse/telemetry.json` — investigation rates, fix rates, shell fallback trends, parser gaps, and timeout patterns. All local, all private, all automatic.

---

## Current Status

| Issue | Status | Ticket |
|-------|--------|--------|
| Friction gradient (autoApprove + hooks) | Spec ready, blocked on TRP-1 | TRP-21 |
| Timeout "up to 120" false claim | ✅ Fixed this session | TRP-4, TRP-6 |
| Python allowlist missing | ✅ Already fixed (CIQ-605) | TRP-5 |
| Venv auto-activation undiscovered | Documentation fix in progress | TRP-24 |
| Rejection message discoverability | Open | TRP-25 |
| Guard hook false positives | Open | TRP-23 |
| HMR detection for Python | Open | TRP-22 |
| Multiplier honesty + real measurement | Spec ready (M27) | TRP-7, TRP-9 |

---

## Contributing Feedback

If you're using TracePulse and hit friction, the most useful thing you can do is document:
1. What you were trying to do
2. What tool you expected to work
3. What actually happened (exact error message or behavior)
4. What you fell back to

File it as a GitHub issue, or if you maintain a chokepoint log in your project, the pattern will eventually reach us through the fleet audit.
