#!/usr/bin/env bash
# TracePulse gate — PreToolUse/Bash hook for Claude Code.
#
# Blocks test/build/lint runners from being shelled out, forcing them through
# TracePulse MCP tools (run_and_watch, verify_build, etc.) which return structured
# JSON with fingerprinted errors.
#
# WHY THIS EXISTS:
# Prose steering cannot enforce tool selection. `.kiro/steering/` is not read by
# Claude Code. A PreToolUse hook is deterministic and context-length-invariant.
# See: docs/how-we-improve.md — "The Friction Gradient Discovery"
#
# INSTALL: tracepulse init --claude
# BYPASS:  TRACEPULSE_GATE_BYPASS=1 (env var or inline prefix)
# VERSION: Shipped with tracepulse package. Regenerate with `tracepulse init`.
#
set -euo pipefail

# ── Bypass check ──
[ "${TRACEPULSE_GATE_BYPASS:-0}" = "1" ] && exit 0

cmd="$(jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"
[ -z "$cmd" ] && exit 0

# Inline bypass: TRACEPULSE_GATE_BYPASS=1 npx vitest run
if printf '%s' "$cmd" | grep -qE '^[[:space:]]*TRACEPULSE_GATE_BYPASS=1[[:space:]]'; then
  exit 0
fi

# ── Strip heredoc bodies and quoted spans (CP-007 fix) ──
# Heredocs: remove everything between <<[-]?['"]?TERM ... TERM
# This prevents false positives on commit messages, fixture strings, and
# chokepoint log entries that MENTION runners without INVOKING them.
stripped="$(printf '%s' "$cmd" | awk '
  /<<-?[[:space:]]*'\''?[A-Za-z_]+'\''?/ { in_heredoc=1; next }
  in_heredoc && /^[A-Za-z_]+[[:space:]]*$/ { in_heredoc=0; next }
  !in_heredoc { print }
')"
# Strip single-quoted and double-quoted spans (mention ≠ invocation)
stripped="$(printf '%s' "$stripped" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")"

# ── Patterns ──
readonly_head='^[[:space:]]*(grep|rg|ag|cat|bat|less|head|tail|ls|find|fd|git|jq|echo|printf|which|wc|sed|awk|sort|uniq|diff)([[:space:]]|$)'

# Word-bounded runner patterns (excludes paths like ./node_modules/.bin/vitest)
runners='(^|[^[:alnum:]_./-])(vitest|jest|pytest|eslint|prettier|ruff|mypy|alembic|tsc)([^[:alnum:]_.-]|$)'
# Package manager + script patterns (npm test, pnpm build, yarn lint, etc.)
scripts='(^|[^[:alnum:]_./-])(npm|pnpm|yarn|bun)([[:space:]]+[^[:space:]]+)*[[:space:]]+(build|test|lint|check|typecheck)([^[:alnum:]_.-]|$)'
vite_build='vite[[:space:]]+build'

# ── Evaluate each chain segment independently ──
# Split on && || ; | and subshell markers. A read-only segment can't execute a runner.
banned=0
segments="$(printf '%s' "$stripped" | sed -E 's/\$\(/\n/g; s/`/\n/g; s/(\&\&|\|\||;|\|)/\n/g')"
while IFS= read -r seg; do
  [ -z "${seg//[[:space:]]/}" ] && continue
  printf '%s' "$seg" | grep -qE "$readonly_head" && continue
  if printf '%s' "$seg" | grep -qE "$runners|$scripts|$vite_build"; then
    banned=1
    break
  fi
done <<SEGMENTS
$segments
SEGMENTS

# ── Emit deny with actionable replacement ──
if [ "$banned" = "1" ]; then
  read -r -d '' reason <<'REASON' || true
⛔ BLOCKED — test/build/lint commands must use TracePulse, not Bash.

TracePulse returns structured errors with fingerprints. Use:
  • run_and_watch(command, timeout_seconds: 300)  — tests/builds/lints
  • verify_build                                   — typecheck + build + errors
  • verify_loop(claim)                             — composite fix verification

If run_and_watch is not available, TracePulse MCP is not connected.
Ask the user to restart the session so .mcp.json is loaded.

Bypass (emergencies only): TRACEPULSE_GATE_BYPASS=1
REASON
  jq -n --arg r "$reason" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
fi
exit 0
