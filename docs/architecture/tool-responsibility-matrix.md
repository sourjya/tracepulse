# Tool Responsibility Matrix

Segregation of duties across the agentic debugging stack: TracePulse, Chrome DevTools MCP, and ViewGraph.

Last updated: 2026-04-28

---

## The Three-Layer Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Coding Agent                           │
│                                                             │
│  Calls tools from all three servers based on what it needs  │
└──────┬──────────────────┬──────────────────┬────────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐  ┌───────────────┐  ┌──────────────┐
│  TracePulse  │  │ Chrome DevTools│  │  ViewGraph   │
│              │  │     MCP       │  │              │
│  Backend     │  │  Browser      │  │  Visual UI   │
│  errors,     │  │  console,     │  │  DOM state,  │
│  logs,       │  │  network,     │  │  a11y,       │
│  builds      │  │  performance  │  │  annotations │
└──────────────┘  └───────────────┘  └──────────────┘
       │                  │                  │
  Dev server         Chrome browser      Browser extension
  stdout/stderr      CDP protocol        Content script
```

---

## Responsibility Matrix

| Capability | TracePulse | Chrome DevTools MCP | ViewGraph |
|------------|:---------:|:-------------------:|:---------:|
| **Error Detection** | | | |
| Backend exceptions / stack traces | ✅ Primary | | |
| Build errors (TypeScript, ESLint, Vite) | ✅ Primary | | |
| Browser console errors (JS) | | ✅ Primary | |
| Browser network failures (4xx/5xx) | | ✅ Primary | |
| Visual/layout bugs | | | ✅ Primary |
| Accessibility issues | | ✅ Lighthouse | ✅ Audit |
| **Log & Event Access** | | | |
| Backend server logs | ✅ Primary | | |
| Browser console messages | | ✅ Primary | |
| HTTP request/response headers | | ✅ Primary | |
| HTTP request/response bodies | | ✅ Primary | |
| DOM tree / element state | | ✅ Snapshot | ✅ Capture |
| CSS computed styles | | ✅ Evaluate | ✅ Capture |
| **Debugging Workflows** | | | |
| Post-change build verification | ✅ `get_build_errors` | | |
| Post-change runtime verification | ✅ `watch_for_errors` | | |
| Post-change visual verification | | ✅ `take_snapshot` | ✅ `get_capture` |
| Error triage (what broke?) | ✅ `get_errors` | | |
| Error deep-dive (surrounding context) | ✅ `get_error_context` | | |
| Auth failures (401/403) | | ✅ `get_network_request` | |
| Request body inspection | | ✅ `get_network_request` | |
| Slow request detection | | ✅ `list_network_requests` | |
| Performance profiling | | ✅ `performance_start_trace` | |
| Memory leak detection | | ✅ `take_memory_snapshot` | |
| **Correlation** | | | |
| Frontend ↔ backend error matching | ✅ `get_correlated_errors` | Provides frontend data | |
| Error ↔ git change linking | ✅ `correlate_with_diff` | | |
| Cross-session error tracking | ✅ `get_error_trends` | | |
| New error detection | ✅ `get_new_errors` | | |
| **Interaction** | | | |
| Click / fill / type in browser | | ✅ Primary | |
| Navigate pages | | ✅ Primary | |
| Screenshot capture | | ✅ Primary | |
| User annotation feedback | | | ✅ Primary |
| **Security** | | | |
| Secret redaction in logs | ✅ Primary | | |
| Localhost-only HTTP binding | ✅ Primary | | |

---

## Decision Flowchart

```
Problem occurs
    │
    ├── Is it a build/compilation error?
    │   └── YES → TracePulse: get_build_errors
    │
    ├── Is it a backend exception (500, crash, traceback)?
    │   └── YES → TracePulse: get_errors → get_error_context
    │
    ├── Is it a browser-side error (JS error, failed fetch)?
    │   └── YES → Chrome DevTools MCP: list_console_messages, list_network_requests
    │
    ├── Is it an auth problem (401/403)?
    │   └── YES → Chrome DevTools MCP: get_network_request (see headers/token)
    │
    ├── Is it a visual/layout bug?
    │   └── YES → ViewGraph: get_capture, audit_accessibility
    │         or Chrome DevTools MCP: take_screenshot
    │
    ├── Need to see request/response body?
    │   └── YES → Chrome DevTools MCP: get_network_request
    │
    ├── Need to verify a fix worked?
    │   └── Backend: TracePulse get_build_errors / get_errors
    │       Browser: Chrome DevTools MCP take_snapshot / list_console_messages
    │       Visual:  ViewGraph get_capture / Chrome DevTools MCP take_screenshot
    │
    └── Need to correlate frontend + backend?
        └── TracePulse: get_correlated_errors
            or manually: Chrome DevTools MCP (find request) + TracePulse (find exception)
```

---

## What Each Tool CANNOT Do

| Tool | Cannot do | Use instead |
|------|-----------|-------------|
| **TracePulse** | See browser console/network | Chrome DevTools MCP |
| **TracePulse** | See request/response bodies | Chrome DevTools MCP |
| **TracePulse** | See visual layout | ViewGraph / Chrome DevTools MCP |
| **TracePulse** | Detect Vite HMR in attach mode | Known limitation (TD-006) |
| **Chrome DevTools MCP** | See backend logs/exceptions | TracePulse |
| **Chrome DevTools MCP** | Parse error stack traces | TracePulse |
| **Chrome DevTools MCP** | Score error importance | TracePulse |
| **Chrome DevTools MCP** | Track errors across sessions | TracePulse |
| **ViewGraph** | See backend state | TracePulse |
| **ViewGraph** | See network requests | Chrome DevTools MCP |
| **ViewGraph** | Interact with page (click/type) | Chrome DevTools MCP |

---

## Overlap Zones (Acceptable)

Some capabilities exist in multiple tools. This is intentional — the agent picks the best one for context:

| Capability | Available in | Preferred |
|------------|-------------|-----------|
| "Is the page working?" | Chrome DevTools MCP (`take_snapshot`) + ViewGraph (`get_capture`) | Chrome DevTools MCP (faster, structured) |
| "Any errors?" | TracePulse (`get_errors`) + Chrome DevTools MCP (`list_console_messages`) | Depends: backend → TP, browser → CDT |
| "Accessibility issues" | Chrome DevTools MCP (`lighthouse_audit`) + ViewGraph (`audit_accessibility`) | ViewGraph (more detailed) |
| "Network failures" | Chrome DevTools MCP (`list_network_requests`) + TracePulse (`get_correlated_errors`) | CDT for details, TP for correlation |

---

## Source of Truth

- **Agent feedback driving this matrix:** `docs/feedback/agent-feedback-log.md`
- **Technical debt / known gaps:** `docs/technical-debt/TECH-DEBT.md`
- **Agent skill file (what the agent reads):** `skills/tracepulse/SKILL.md`
