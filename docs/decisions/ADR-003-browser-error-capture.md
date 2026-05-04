# ADR-002: Browser Error Capture Strategy

**Date:** 2026-04-29
**Status:** Decided
**Context:** Frontend JS errors (e.g., `ReferenceError: readOnly is not defined`) are invisible to TracePulse because TP monitors backend stdout/stderr only.

## Options Evaluated

| Option | Friction | Pros | Cons |
|--------|----------|------|------|
| **A. Custom ErrorBoundary bridge** | High - requires project-specific code in both frontend (ErrorBoundary POST) and backend (new endpoint) | Catches React crashes | Not scalable, every project different, only catches ErrorBoundary crashes |
| **B. TP browser SDK (`<script>`)** | Medium - one line in index.html | Catches all JS errors, works with any framework | Requires project modification, needs TP to serve a JS file |
| **C. Vite plugin** | Medium - one line in vite.config.ts | Auto-injects at build time | Only works with Vite, requires project modification |
| **D. Agent injects via evaluate_script** | Low - one MCP tool call per session | Zero project changes, works immediately | Must re-inject after page reload, requires Chrome DevTools MCP |
| **E. Agent checks console directly** | **Zero** - just two tool calls | Zero project changes, zero injection, zero setup | Requires Chrome DevTools MCP, agent must remember to check both |
| **F. TP polls Chrome DevTools MCP** | Zero - automatic | Fully automatic | TP can't call another MCP server's tools (architectural limitation) |

## Decision

**Approach E (agent checks console directly) as the primary recommendation.** Approach D (inject error catcher) as the secondary for long sessions.

### Rationale

1. **Zero friction wins.** The agent already has Chrome DevTools MCP. Adding `list_console_messages(types: ["error"])` after `verify_fix()` is two tool calls, zero project changes, zero setup.

2. **Error collection is the tooling's job, not the project's.** Option A (ErrorBoundary bridge) puts the responsibility on the project. Every project would need different code. This is the wrong abstraction.

3. **The skill teaches the pattern.** `skills/browser-errors/SKILL.md` documents three approaches and when to use each. The agent picks based on situation.

4. **Option F is architecturally impossible today.** MCP servers can't call other MCP servers. Only the agent can orchestrate across servers. This is a fundamental MCP protocol constraint, not a TracePulse limitation.

## What the agent built (and why we rejected it)

The agent independently built a custom ErrorBoundary bridge in the Nexus project:
- Frontend: ErrorBoundary `componentDidCatch` POSTs to `/api/v1/frontend-error`
- Backend: New endpoint logs via structlog
- TP: Picks up the structlog output from stdout

This works for one project but is not scalable. It requires:
- Custom frontend code per project
- Custom backend endpoint per project
- Framework-specific ErrorBoundary knowledge

The zero-friction alternative (Approach E) requires nothing from the project.

## Convergence Evidence

The agent and the TP team independently arrived at the same underlying architecture:

```
Browser error -> HTTP POST -> TP log collector (port 9801) -> get_errors
```

- **TP team** built the skill with `evaluate_script` injection
- **Agent** built the ErrorBoundary -> backend endpoint -> structlog bridge

Both use HTTP POST to get browser errors into TP. The difference is where the POST originates (injected script vs project code). The skill approach is better because it requires zero project changes.

## Future Consideration

If MCP protocol adds server-to-server communication, Option F (TP auto-polls Chrome DevTools MCP) becomes possible and would be the ideal solution - fully automatic, zero friction, zero injection.
