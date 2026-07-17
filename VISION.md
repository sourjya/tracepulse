# Vision

**AI coding agents shouldn't waste tokens guessing what happened. They should know.**

---

## The Problem

LLMs can't see what happens when their code runs. They edit a file, the server restarts, and then — silence. The agent reads logs, re-reads its own output, re-reads the file, and burns tokens trying to figure out what went wrong. The loop repeats until the context window fills or the user intervenes.

Research confirms this is systemic:
- 59% of token consumption in agentic coding goes to re-reading and orientation, not problem-solving (arXiv 2601.14470)
- Developers report 60-80% token waste from agents chasing blind spots
- Every wasted token is wasted compute, wasted energy, and avoidable carbon emissions

## The Vision

**TracePulse is the auditory cortex of the AI coding agent.** ViewGraph sees the UI. Chrome DevTools drives the browser. TracePulse hears what the backend is saying — and tells the agent in structured, scored, deduplicated form.

The agent edits code, calls `get_errors`, and instantly knows:
- Did the fix work?
- Are there new errors?
- What file and line is the problem on?
- How severe is it?

No log reading. No copy-paste. No guessing. One tool call, one structured answer.

## The Principles

**1. Fewer wasted tokens.** Every tool response is structured, scored, and deduplicated. The agent gets signal, not noise. 12x fewer tokens per error compared to raw log parsing.

**2. Faster shipping.** The feedback loop shrinks from minutes (read logs → interpret → re-read) to seconds (call tool → get answer). Agents fix bugs in one pass instead of three.

**3. Lower carbon footprint.** Fewer tokens means less GPU inference, less data center energy, less CO2. At scale (1,000 developers × 10 sessions/week), this saves ~110M tokens/week — measurable environmental impact.

**4. Responsible AI in action.** TracePulse tracks its own environmental savings: tokens saved → energy (Wh) → CO2 (g). Every session shows its footprint. Sustainability isn't a marketing claim — it's a metric.

## The Architecture

```
Dev Server stdout/stderr
        ↓
   ANSI stripping → Secret redaction → Hot-reload detection
        ↓
   25 framework-specific parsers (Node, Python, Go, Java, Rust, and more)
        ↓
   Signal scoring (0-100) → Fingerprint deduplication
        ↓
   Ring buffer (in-memory, 500 events max)
        ↓
   44 MCP tools — any AI agent can call them
```

Zero config. Zero dependencies in the target app. Zero secrets in output. Works with any MCP-compatible agent: Kiro, Claude Code, Cursor, Copilot, Windsurf, Cline.

## The Future

TracePulse starts as the backend feedback layer. Where it goes:

- **Team mode** — shared error fingerprints across every developer's agent
- **Cross-layer diagnosis** — correlate frontend crashes with backend stack traces automatically
- **Drift detection** — catch env, dependency, and migration drift before the agent chases red herrings
- **Effectiveness telemetry** — measure whether the agent's fixes actually stick across sessions

The goal is simple: make the AI agent as situationally aware as a senior developer who can see the UI, act in the browser, and hear the server — all at once.

---

*TracePulse is open source under AGPL-3.0.*
