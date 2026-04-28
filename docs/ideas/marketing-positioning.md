# TracePulse - Marketing Ideas & Positioning

Captured from competitive research, ecosystem analysis, and real agent feedback. 2026-04-28.

---

## Core Positioning

### One-liner
**"TracePulse feels the backend so your AI agent doesn't code blind."**

### Elevator pitch
AI coding agents can write code but can't see what happens when it runs. They edit a file, hope for the best, and iterate blindly when things break. TracePulse watches your dev server's output, parses errors into structured data, scores them by importance, and serves them to the agent through MCP. The agent edits code, calls `get_errors()`, and instantly knows if the fix worked. No manual log reading, no copy-paste, no blind iteration.

### The problem (from Sentry's own blog)
> "LLMs can't see what happens when their code actually runs. They're throwing darts in the dark, making change after change yet never able to correct their aim. Errors begin to multiply as the LLM iterates blindly on top of those issues."
> - Sentry Engineering Blog, "Vibe Coding: Closing The Feedback Loop With Traceability"

TracePulse closes this loop at dev time - seconds after the code change, not minutes after deployment.

---

## Positioning Against the Stack

```
Time to feedback:  SECONDS          SECONDS           MINUTES
                     │                 │                  │
                     ▼                 ▼                  ▼
               ┌──────────┐    ┌──────────────┐    ┌──────────┐
               │TracePulse│    │Chrome DevTools│    │  Sentry  │
               │          │    │     MCP       │    │ Datadog  │
               │ Backend  │    │   Browser     │    │Production│
               │ Dev Time │    │   Dev Time    │    │Post-Deploy│
               └──────────┘    └──────────────┘    └──────────┘
                    │                 │                  │
              "Did my Python    "Did the page     "Did it break
               code crash?"     render right?"    in production?"
```

**TracePulse is the first line of defense.** It catches errors before they reach the browser, before they reach staging, before they reach production.

---

## Key Messages

### For developers
- "Stop copy-pasting error logs into your AI chat"
- "Your AI agent can now read your dev server's errors directly"
- "10 error parsers, 13 MCP tools, zero config: `npx tracepulse start 'npm run dev'`"

### For teams
- "Every error scored 0-100 so your agent triages like a senior dev"
- "Secret redaction built in - API keys never reach the AI"
- "Works with any language: Node.js, Python, Go, Java, Rust"

### For the ecosystem
- "ViewGraph sees the UI. TracePulse feels the backend."
- "Backend verification (TracePulse) + Browser verification (Chrome DevTools MCP) + Visual verification (ViewGraph) = complete agentic debugging stack"

---

## Proof Points

### From real agent usage (PlanIQ project, 2026-04-28)

**Trust earned in one session:**
- Agent went from "I need to run `vite build` manually to be sure" to calling `get_build_errors` reflexively after every change
- Agent called it "the most reliable of the post-change checks"
- After freshness metadata was added, agent said: "the `oldest_event_at` field confirms the buffer is fresh. This addresses my earlier concern about stale data."

**Quantifiable workflow improvement:**
- Agent replaced manual `vite build` runs with `get_build_errors` (5 seconds vs 30+ seconds)
- Agent replaced manual log file reading with `get_errors` (1 tool call vs scrolling through terminal)
- Agent's debugging flow went from 5+ manual steps to 1-2 tool calls

### From CyberAgent case study (Chrome DevTools MCP)
- Audited 236 Storybook stories in 1 hour, fully automated
- Found 1 error + 2 warnings across 32 components
- Key value: confirming 233 stories were clean (negative assurance)
- TracePulse enables the same pattern for backend APIs

---

## Differentiators (vs every competitor)

| What we do | Nobody else does |
|------------|-----------------|
| Parse backend errors into structured data | Competitors pass raw text to agents |
| Score errors 0-100 by importance | Agents have to guess what matters |
| Deduplicate by fingerprint | Agents see the same error 50 times |
| Detect hot-reload from 11 dev tools | Agents don't know if the server reloaded |
| Correlate errors with git changes | Agents can't connect errors to their edits |
| Track errors across sessions | Every session starts from zero |
| Redact secrets before they reach the AI | Other tools pass raw logs including tokens |
| Work without a browser | Every competitor requires Chrome |
| Ship agent skill files | Agents have to figure out tools on their own |

---

## Content Ideas

### Blog posts
1. **"The Blind Spot in Agentic Coding"** - Expand on Sentry's thesis. LLMs can't see runtime. TracePulse fixes this at dev time.
2. **"From 5 Steps to 1: How an AI Agent Learned to Trust TracePulse"** - Real story from PlanIQ. Agent went from manual verification to habitual `get_build_errors`.
3. **"The Three-Layer Debugging Stack"** - TracePulse + Chrome DevTools MCP + ViewGraph. How they complement each other.
4. **"Signal Scoring: Teaching AI Agents to Triage Like Senior Devs"** - Deep dive into the 0-100 scoring system and why it matters.
5. **"Zero to 566 Tests: Building an MCP Server with AI"** - Meta story about building TracePulse itself with Kiro.

### Demos
1. **"Fix a Python crash in 30 seconds"** - Agent edits code, calls `watch_for_errors`, sees the error, fixes it, calls again, clean.
2. **"Audit all API endpoints"** - CyberAgent pattern applied to a REST API. Single prompt, full audit.
3. **"Full-stack debugging"** - Frontend shows blank page. Agent uses Chrome DevTools MCP to find 500, TracePulse to find the backend exception, fixes it.

### Comparisons
1. **"TracePulse vs reading terminal logs"** - Before/after workflow comparison
2. **"TracePulse vs Sentry MCP"** - Not competitors, complementary. Dev time vs production.
3. **"The complete MCP debugging toolkit"** - How to set up TracePulse + Chrome DevTools MCP + ViewGraph together

---

## Target Audiences

### Primary: AI-assisted developers
- Use Cursor, Claude Code, Kiro, Copilot, Windsurf daily
- Frustrated by copy-pasting errors into chat
- Want the agent to "just know" what broke

### Secondary: Team leads / DevEx engineers
- Setting up agentic workflows for their team
- Need security (secret redaction) and reliability
- Want standardized debugging practices (SKILL.md, CLAUDE.md patterns)

### Tertiary: Tool builders
- Building on MCP ecosystem
- Looking for companion tools to integrate with
- Interested in the three-layer stack pattern

---

## Competitive Moat

1. **10 error parsers** - Hard to replicate. Each parser is hand-tuned regex for a specific framework's error format.
2. **Signal scoring algorithm** - Calibrated from real-world usage. Not trivial to get right.
3. **Agent skill files** - First-mover in teaching agents HOW to use debugging tools, not just providing them.
4. **Three-layer companion design** - Architectural decision that makes TracePulse more valuable alongside Chrome DevTools MCP and ViewGraph, not less.
5. **Real agent feedback loop** - We're iterating based on actual agent behavior (PlanIQ), not hypothetical use cases.
