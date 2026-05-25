# Shell Misuse Detection

TracePulse monitors how the AI agent uses its tools and provides behavioral feedback to improve efficiency.

## The Problem

AI coding agents default to `shell` for test, build, and lint commands out of habit — even when `run_and_watch` provides structured output, error fingerprinting, and cross-session tracking. This costs:

- **Lost structured data** — shell returns raw text; `run_and_watch` returns parsed pass/fail with error details
- **No fingerprinting** — errors from shell calls can't feed into `get_errors`, `correlate_with_diff`, or `get_bug_patterns`
- **Wasted tokens** — the agent must parse raw output itself
- **No cross-session learning** — shell output isn't persisted

## How It Works

TracePulse uses a two-layer approach: positive reinforcement when the agent does the right thing, and detection when it doesn't.

### Layer 1: Positive Reinforcement

On the **first successful use** of `run_and_watch`, `verify_build`, or `verify_loop` per session, the response includes a `_tip` field:

```json
{
  "exit_code": 0,
  "success": true,
  "summary": "Command succeeded in 1946ms, 0 warnings",
  "_tip": "✓ Structured results + fingerprinting. Keep using run_and_watch for all test/build/lint commands."
}
```

The tip appears **once per tool per session**, then goes silent. This establishes the habit without burning repeat tokens (~45 tokens max per session).

### Layer 2: Shell Misuse Detection

`get_session_insights` **always** includes a `shell_misuse` section that reports any shell calls matching known test/build/lint patterns:

```json
{
  "shell_misuse": {
    "count": 2,
    "violations": [
      { "command": "uv build", "timestamp": 1716000000, "truncated_output": false },
      { "command": "pytest tests/ 2>&1 | tail -5", "timestamp": 1716000060, "truncated_output": true }
    ],
    "recommendation": "2 shell call(s) should have used run_and_watch. Shell bypasses structured parsing, fingerprinting, and cross-session tracking."
  }
}
```

When the session is clean:

```json
{
  "shell_misuse": {
    "count": 0,
    "violations": [],
    "recommendation": null
  }
}
```

The field is **always present** — even when clean — as a passive reminder that shell usage is being tracked.

## What Gets Flagged

### Test Runners
`pytest`, `vitest`, `jest`, `mocha`, `cargo test`, `go test`, `mvn test`, `gradle test`, `npm test`, `bun test`

### Type Checkers
`tsc`, `mypy`

### Linters
`eslint`, `ruff check`, `pylint`, `prettier --check`, `cargo clippy`

### Build Commands
`npm run build`, `vite build`, `tsup`, `uv build`, `cargo build`, `go build`, `docker compose build`, `mvn package`

### Output Truncation
Any command piped through `| tail`, `| head`, or `| grep` — a sign the agent is losing data.

## What Is NOT Flagged

These are legitimate shell uses:

- `git status`, `git diff`, `git log`
- `cat`, `ls`, `head` (file inspection)
- `curl` (API verification)
- `kill`, `pgrep` (process management)
- Environment checks (`env`, `whoami`)

## Token Budget

| Mechanism | When | Cost |
|-----------|------|------|
| `_tip` in response | First successful use per tool | ~15 tokens × 3 tools = 45 max/session |
| `shell_misuse` (clean) | Every `get_session_insights` | ~30 tokens |
| `shell_misuse` (violations) | When misuse detected | ~80-150 tokens |

Total overhead for a well-behaved session: **~75 tokens**.

## Why This Design

1. **Positive reinforcement > punishment** — behavioral psychology shows rewarding correct behavior is more effective than punishing incorrect behavior
2. **One-time tips avoid noise** — a tip on every call becomes invisible after the 3rd time
3. **Always-present field = passive deterrent** — the agent knows it's being tracked even when clean
4. **Pattern-based detection** — only flags commands that have a better alternative, not all shell usage
5. **Works universally** — built into TracePulse itself, no external steering files or hooks required. Works with any MCP client (Kiro, Claude Code, Cursor, Copilot, Windsurf)
