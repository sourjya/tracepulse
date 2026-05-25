# Shell Misuse Detection & Positive Reinforcement

## Problem

AI coding agents default to `shell` for test/build/lint commands out of habit, even when `run_and_watch` provides structured output, error fingerprinting, and cross-session tracking. Steering files (text-based rules) are advisory-only — agents violate them when habit overrides instruction. The enforcement gap costs:

- **Lost structured data** — shell returns raw text; run_and_watch returns parsed pass/fail with error details
- **No fingerprinting** — errors from shell calls can't feed into `get_errors`, `correlate_with_diff`, or `get_bug_patterns`
- **Wasted tokens** — the agent must parse raw output itself instead of receiving pre-parsed JSON
- **No cross-session learning** — shell output isn't persisted, so recurring errors aren't detected

## Solution: Two-Layer Behavioral Nudging

### Layer 1: Positive Reinforcement (Carrot)

**File:** `src/analysis/positive-nudge.ts`

On the **first successful use** of `run_and_watch`, `verify_build`, or `verify_loop` per session, the response includes a `_tip` field with a short positive message. Subsequent calls are silent.

**Justification:**
- Behavioral psychology: positive reinforcement at the moment of correct behavior is more effective than punishment after incorrect behavior
- One-time-per-session avoids token waste (~15 tokens per tool, max 45 tokens/session total)
- The `_tip` field uses underscore prefix to signal metadata (not confused with result data)
- Fires only on success — failed commands don't get praised

**Tools that receive nudges:**
| Tool | Why |
|------|-----|
| `run_and_watch` | Primary tool agents misuse by defaulting to shell |
| `verify_build` | Composite tool that replaces 3 separate shell calls |
| `verify_loop` | Composite verification that replaces 5-7 calls |

Other tools (`get_errors`, `get_health_summary`, etc.) don't have a shell alternative, so no nudge is needed.

### Layer 2: Shell Misuse Detection (Stick)

**Files:** `src/analysis/shell-misuse.ts`, `src/constants/shell-misuse.ts`

The `get_session_insights` response **always** includes a `shell_misuse` section that reports any `shell` tool calls where the command matched known test/build/lint patterns.

**Justification for always-present field:**
- Constant visibility acts as a passive deterrent — the agent knows it's being tracked even when clean
- Zero-count responses (`"count": 0`) reinforce good behavior without extra tokens
- Removing the field when clean would make it invisible during good sessions, losing the deterrent effect
- Consistent schema is easier for agents to parse than conditional fields

**Detection patterns** (`src/constants/shell-misuse.ts`):
- Test runners: pytest, vitest, jest, cargo test, go test, mvn test, etc.
- Type checkers: tsc, mypy
- Linters: eslint, ruff, pylint, clippy
- Build commands: npm run build, uv build, cargo build, docker compose build, etc.
- Output truncation: any command piped through `| tail`, `| head`, `| grep` (data loss indicator)

**Justification for pattern-based detection over blanket shell blocking:**
- Shell has legitimate uses (git status, file inspection, curl, process management)
- Pattern matching is precise — only flags commands that have a better alternative
- Output truncation detection catches a subtler anti-pattern (agent losing data by piping)

## Token Budget Analysis

| Mechanism | When it fires | Token cost |
|-----------|--------------|------------|
| `_tip` in tool response | First successful use per tool per session | ~15 tokens × 3 tools = 45 max/session |
| `shell_misuse` (clean) | Every `get_session_insights` call | ~30 tokens (fixed schema) |
| `shell_misuse` (violations) | When misuse detected | ~80-150 tokens (capped at 5 violations) |
| Recommendation in insights | When misuse detected | ~40 tokens |

**Total overhead for a well-behaved session:** ~75 tokens (45 from tips + 30 from clean shell_misuse field).
**Total overhead for a session with misuse:** ~200-250 tokens — but this pays for itself by teaching the agent to stop wasting tokens on unstructured shell output.

## Architecture

```
src/
├── analysis/
│   ├── positive-nudge.ts    # One-time-per-session positive reinforcement
│   ├── shell-misuse.ts      # Audit trail scanner for shell violations
│   └── usage-nudge.ts       # Existing: "never used run_and_watch" nudge
├── constants/
│   └── shell-misuse.ts      # Regex patterns for test/build/lint commands
└── tools/
    ├── run-and-watch.ts     # Calls getPositiveNudge("run_and_watch")
    ├── verify-build.ts      # Calls getPositiveNudge("verify_build")
    ├── verify-loop.ts       # Calls getPositiveNudge("verify_loop")
    └── get-session-insights.ts  # Calls detectShellMisuse(), always includes result
```

## Relationship to External Enforcement

This feature is **internal to TracePulse** — it works regardless of whether the user has kiro-rails steering files, hooks, or any external enforcement. The detection happens at runtime inside the MCP server, making it universally effective across all MCP clients (Kiro, Claude Code, Cursor, Copilot, Windsurf, etc.).

External enforcement (steering files, hooks) tells the agent what to do *before* it acts. TracePulse tells the agent what it did *after* it acts. Both layers complement each other, but TracePulse's layer works even when the external layer is absent.

## Prior Art

- A companion full-stack project uses `tracepulse-subagent-rules.md` (steering) + `enforce-tracepulse-usage.kiro.hook` (advisory hook) for the same problem, but those are kiro-rails managed files that only work in kiro-rails projects
- The existing `usage-nudge.ts` detects "never used run_and_watch at all" — this feature extends it to detect "used shell when run_and_watch was the right choice"
