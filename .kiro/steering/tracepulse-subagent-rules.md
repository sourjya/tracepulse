---
inclusion: always
---

# TracePulse - Subagent Tool Rules

## Subagent Tool Rules - MANDATORY

When spawning subagents via the `subagent` tool, every `prompt_template` MUST include these rules at the top (before the task description):

```
MANDATORY TOOL RULES:
- Use run_and_watch for ALL test, build, and lint commands (pytest, vitest, tsc, eslint, cargo test, go test, mvn test).
- If run_and_watch times out, increase timeout_seconds (e.g., timeout_seconds: 120 for large suites). Never fall back to Shell.
- For large test suites (500+ tests), always use timeout_seconds: 120 from the start.
- Use the cwd parameter instead of cd prefix. Absolute paths are allowed.
- Shell is ONLY for non-execution tasks: file inspection, git status, environment checks.
- Never use Shell for commands that produce pass/fail output.
- After a smoke test or endpoint sweep, use: get_new_errors({ since: <start_ms> }) to scope to that window.
```

### Why

Shell bypasses TracePulse error tracking, fingerprinting, and structured parsing. Subagents that use Shell for tests produce unstructured output that can't feed into `get_errors`, `correlate_with_diff`, or cross-session `get_bug_patterns`.

### Enforcement

There is no system-level tool restriction for subagents. The prompt is the only lever. Place rules BEFORE the task, not after. Be explicit about fallback behavior (increase timeout, don't switch tools).
