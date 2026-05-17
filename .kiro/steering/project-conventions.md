---
inclusion: always
---

# Project-Specific Conventions

Rules specific to this project's codebase, tools, and architecture.
For project-specific overrides (tech stack, ports, database, code style), see `user-project-overrides.md`.

## Git and Terminal Workflow

Terminal output capture can be unreliable in this environment. Always use the standard git scripts in `scripts/` which pipe output through `tee` to `logs/`.

## Domain Constants Strategy

**Rule: All domain constants live in a dedicated constants directory - never inline in model files.**

- Never define domain constants inline in a model file
- When adding a new feature with constants, create a dedicated constants file

## Testing Execution

- Always stream test output: use `pytest -v --tb=short` with NO pipes (`| tail`, `| head`, `| grep`)
- Both positive AND negative test cases are required

## Code Style

- Use `datetime.now(timezone.utc)` - never `datetime.utcnow()` (deprecated)
- Use parameterized queries for all SQL - never string interpolation
- Separation of concerns: keep services as separate classes

## Architecture Decisions

- ADRs are required before major implementations - store them in `docs/decisions/`

## Environment and Tooling

- Use the project's virtual environment for all Python work. Never install packages globally.
- Never install packages in the global Python registry.

## Command Output Logging - MANDATORY

ALL commands that produce output you need to analyze MUST be logged to files using `tee`.

### Logging Pattern:
```bash
python -m pytest tests/ -v --tb=short 2>&1 | tee logs/test_results.log
```

### Log File Location:
- All command logs: `logs/`

## Subagent Tool Rules - MANDATORY

When spawning subagents via the `subagent` tool, every `prompt_template` MUST include these rules at the top (before the task description):

```
MANDATORY TOOL RULES:
- Use run_and_watch for ALL test, build, and lint commands (pytest, vitest, tsc, eslint, cargo test, go test, mvn test).
- If run_and_watch times out, increase timeout_seconds (up to 120). Never fall back to Shell.
- Shell is ONLY for non-execution tasks: file inspection, git status, environment checks.
- Never use Shell for commands that produce pass/fail output.
```

### Why

Shell bypasses TracePulse error tracking, fingerprinting, and structured parsing. Subagents that use Shell for tests produce unstructured output that can't feed into `get_errors`, `correlate_with_diff`, or cross-session `get_bug_patterns`.

### Enforcement

There is no system-level tool restriction for subagents. The prompt is the only lever. Place rules BEFORE the task, not after. Be explicit about fallback behavior (increase timeout, don't switch tools).
