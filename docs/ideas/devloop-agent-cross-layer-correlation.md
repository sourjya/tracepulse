# DevLoop Agent — Cross-Layer Correlation & Auto-Diagnosis

**Date:** 2026-05-17
**Status:** Implemented (Phases 1-3)
**Priority:** High (addresses repeated pain points in every dev session)

## The Problem

During development, failures span multiple layers (backend, frontend, auth, rate limiting, schema validation) but no single tool correlates them. The coding agent repeatedly misdiagnoses issues because it only sees one layer at a time:

- Backend returns 200 but frontend shows "Failed" → expired auth token (not a code bug)
- Schema validation rejects request (422) → TP shows status code but not which field failed
- Rate limit hit after eval run → no tool says "bucket is full from previous run"
- Code changed but server not restarted → change isn't live, not a logic error
- Same error 3x in 5 min → stop retrying, investigate root cause

## The Solution: DevLoop Agent

A correlation engine that watches the full stack simultaneously and produces actionable diagnoses:

| Signal Combination | Diagnosis |
|---|---|
| Backend 200 + Frontend error | "Auth token expired. Re-authenticate." |
| 422 + recent schema change | "Field X exceeds max_length. Fix schema." |
| 429 + eval run in last 5 min | "Rate limiter bucket full from eval. Reset." |
| Code changed + no restart detected | "Server running old code. Restart required." |
| Error repeats 3x | "Not transient. Root cause investigation needed." |

## Data Sources (Already Available)

- **TracePulse** — backend logs, errors, HTTP status codes
- **Chrome DevTools MCP** — browser console, network requests, DOM state
- **Git** — uncommitted changes, recent commits
- **Build pipeline** — TypeScript errors, Vite output
- **Process manager** — server PID, restart timestamps

## Architecture

```
┌─────────────────────────────────────────────┐
│           DevLoop Agent (new TP feature)     │
│                                             │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Backend │  │ Frontend │  │ Git/Build │  │
│  │ Signals │  │ Signals  │  │ Signals   │  │
│  └────┬────┘  └────┬─────┘  └─────┬─────┘  │
│       └────────────┼───────────────┘        │
│                    ▼                        │
│         ┌──────────────────┐                │
│         │ Correlation Engine│                │
│         │ (pattern matching │                │
│         │  + heuristics)    │                │
│         └────────┬─────────┘                │
│                  ▼                          │
│         ┌──────────────────┐                │
│         │ Diagnosis + Fix  │                │
│         │ Recommendation   │                │
│         └──────────────────┘                │
└─────────────────────────────────────────────┘
```

## Implementation Path

1. **Phase 1:** Add `get_cross_layer_diagnosis` tool that combines `get_errors` + browser state + git diff
2. **Phase 2:** Pattern library — known failure combinations → diagnoses
3. **Phase 3:** Auto-intervention — when diagnosis confidence > 90%, suggest fix directly
4. **Phase 4:** Learning — track which diagnoses were correct, improve patterns

## Relationship to CoreIQ

This is CoreIQ's "Agent Fleet Management" (pillar 5) applied to the development process. The DevLoop Agent is itself an agent being managed — it watches the developer's agent (Kiro/Claude) and intervenes when it's going in circles.
