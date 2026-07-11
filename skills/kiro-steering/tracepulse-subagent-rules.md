---
inclusion: always
---

# TracePulse - Subagent Tool Rules

## Shell Restriction — MANDATORY

**Never use `shell` for commands that produce pass/fail output.** Use `run_and_watch` instead.

| Command type | Tool to use | Example |
|---|---|---|
| Tests | `run_and_watch` | `pytest tests/`, `npx vitest run`, `cargo test` |
| Type checking | `run_and_watch` | `npx tsc --noEmit`, `mypy src/` |
| Linting | `run_and_watch` | `ruff check`, `npx eslint src/` |
| Builds | `run_and_watch` | `npm run build`, `vite build`, `cargo build` |
| File inspection | `shell` | `cat`, `ls`, `grep`, `head` |
| Git operations | `shell` | `git status`, `git log`, `git diff` |
| Process mgmt | `shell` | `pgrep`, `kill`, `ss` |

## The Recurring Failure Pattern (STOP THIS)

This pattern is documented 30+ times across the fleet. Do not repeat it:

1. Agent tries `run_and_watch("pytest tests/")` ← correct
2. Tool rejects (metacharacters, or agent uses `cd && ...`) ← fixable
3. Agent **falls back to shell** ← **THIS IS THE BUG**

**Step 3 is FORBIDDEN.** If `run_and_watch` rejects a command, restructure to comply:

```
# ❌ REJECTED (metacharacters):
run_and_watch("cd backend && pytest tests/")

# ✅ CORRECT — use cwd parameter:
run_and_watch("pytest tests/", cwd: "./backend")

# ❌ REJECTED (unknown prefix):
run_and_watch("/usr/bin/python -m pytest tests/")

# ✅ CORRECT — TracePulse auto-activates .venv/:
run_and_watch("pytest tests/", cwd: "./backend")

# ❌ WRONG FALLBACK:
shell("cd backend && .venv/bin/python -m pytest -v 2>&1 | tail -30")

# ✅ CORRECT (if you need limited output):
run_and_watch("pytest tests/ -q", cwd: "./backend", max_lines: 30)
```

## Python Projects — Venv Auto-Activation

TracePulse auto-detects `.venv/` in the working directory and adds it to PATH. This means:
- `run_and_watch("pytest tests/", cwd: "./backend")` **just works**
- No `.venv/bin/` prefix needed
- No `bash -c` wrapper needed
- No `source activate` needed

## Subagent Prompt Template — MANDATORY

When spawning subagents via the `subagent` tool, every `prompt_template` MUST include these rules at the top (before the task description):

```
MANDATORY TOOL RULES:
- Use run_and_watch for ALL test, build, and lint commands (pytest, vitest, tsc, eslint, cargo test, go test, mvn test).
- If run_and_watch times out, increase timeout_seconds (e.g., timeout_seconds: 120 for large suites, 300 for full integration runs). Never fall back to Shell.
- For large test suites (500+ tests), always use timeout_seconds: 120 or higher from the start. There is no maximum.
- Use the cwd parameter instead of cd prefix. Absolute paths are allowed.
- Shell is ONLY for non-execution tasks: file inspection, git status, environment checks.
- Never use Shell for commands that produce pass/fail output.
- After a smoke test or endpoint sweep, use: get_new_errors({ since: <start_ms> }) to scope to that window.
```

### Why

Shell bypasses TracePulse error tracking, fingerprinting, and structured parsing. Subagents that use Shell for tests produce unstructured output that can't feed into `get_errors`, `correlate_with_diff`, or cross-session `get_bug_patterns`.

### Enforcement

There is no system-level tool restriction for subagents. The prompt is the only lever. Place rules BEFORE the task, not after. Be explicit about fallback behavior (increase timeout, don't switch tools).
