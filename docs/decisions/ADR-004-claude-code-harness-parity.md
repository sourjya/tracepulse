# ADR-004: Claude Code Harness Parity — Dogfood the Gate + Port the Kiro Discipline Hooks

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-18 |
| **Decision Makers** | Maintainers (TRP-71) |
| **Ticket** | TRP-71 |

## Context

TracePulse enforces engineering discipline through two mechanisms that do **not**
see each other:

- **Kiro harness** — ~30 `.kiro/hooks/*.kiro.hook` files (userPromptSubmit,
  fileEdited, beforeCommit, pre/postToolUse) plus `.kiro/steering/*.md`. These fire
  only inside the Kiro IDE harness.
- **Claude Code harness** — `.claude/settings.json` hooks (PreToolUse, PostToolUse,
  UserPromptSubmit, Stop) plus `CLAUDE.md`. Claude Code **does not read**
  `.kiro/steering/` or `.kiro/hooks/`.

The repo already *ships* a PreToolUse gate to its **consumers** —
`skills/claude-hooks/tracepulse-gate.sh`, installed by `tracepulse init --claude`
(TRP-23) — but the TracePulse repo's own Claude Code harness wired **none** of it.
Only permissions lived in `.claude/settings.local.json`. Consequences:

1. **We did not dogfood our own gate.** The product tells users to route
   test/build/lint through TracePulse MCP tools, but our own agent sessions could
   still shell out to `npx vitest` unchecked.
2. **Discipline was harness-specific.** Every guardrail encoded as a Kiro hook
   (variant search, fix-spiral detection, focus guard, session isolation,
   changelog/spec/bug-doc gates) silently evaporated the moment work happened in a
   Claude Code session instead of Kiro.

The root cause is a known one, documented in `docs/how-we-improve.md` ("The Friction
Gradient Discovery"): **prose steering cannot enforce tool selection.** A
`CLAUDE.md` sentence is context-length-sensitive and easy to skip; a hook is
deterministic and context-length-invariant. Parity therefore has to be built at the
**hook** layer, per harness — not by copying steering text.

## Decision Drivers

- **Dogfooding.** If the gate is good enough to ship, it is good enough to bind us.
- **Determinism over prose.** Guardrails must be enforced by hooks, not by hoping
  the agent re-reads a steering file.
- **Harness independence.** Kiro hooks cannot reach Claude Code; the discipline must
  be re-expressed in Claude Code's own event model.
- **Public-repo hygiene (TRP-39).** `.claude/` is gitignored on purpose — the
  *shippable* templates are the tracked ones under `skills/`. Local harness config
  must not leak into the public tree.
- **Low false-positive cost.** A guardrail that cries wolf gets ignored; advisory
  reminders must stay silent on the happy path.

## Considered Options

1. **Do nothing** — rely on `CLAUDE.md` prose. Rejected: this is exactly the
   failure mode the Friction Gradient Discovery documents.
2. **Ship the hooks into the tracked tree** (commit `.claude/settings.json`).
   Rejected: violates TRP-39 (keep `.claude/` out of the public repo); the tracked,
   shippable surface is `skills/`, and `tracepulse init --claude` is how consumers
   get hooks.
3. **Port Kiro hooks 1:1 as blocking gates.** Rejected for the `askAgent` hooks:
   Kiro's `askAgent` is *advisory* (it asks the agent to check, it does not block),
   and a dumb bash reimplementation of, e.g., the parser-breaking-comment scan would
   false-positive on regex strings and block legitimate commits.
4. **Wire hooks into the local, gitignored `.claude/settings.json`, mapping each
   Kiro trigger to the nearest Claude Code event, preserving each hook's original
   blocking-vs-advisory semantics.** **Chosen.**

## Decision

Chosen option: **Option 4.** Wire the discipline into the repo's local
`.claude/settings.json` (+ two helper scripts under the gitignored
`.claude/hooks/`), mapping Kiro triggers onto Claude Code's event model and
**keeping the original semantics**: hard gate stays a gate, advisory `askAgent`
stays advisory (delivered as `additionalContext`, which lets the agent perform the
same check Kiro would have asked for).

### Mapping

| Source (`.kiro/hooks/`) | Kiro trigger | Claude Code event | Mechanism | Blocking? |
|---|---|---|---|---|
| `tp-shell-intercept` → shipped `tracepulse-gate.sh` | preToolUse/shell | PreToolUse / Bash | deny test/build/lint runners → TracePulse MCP | **Yes** (deny) |
| `type-check-on-stop` | agentStop | Stop | `tsc --noEmit`, output only on error | No (advisory) |
| `session-guard-check` | userPromptSubmit | UserPromptSubmit | `scripts/session-guard.sh --status`, warn on collision | No |
| `variant-search-on-fix-branch` | userPromptSubmit | UserPromptSubmit | reminder on fresh `fix/` branches | No |
| `focus-guard` | userPromptSubmit | UserPromptSubmit | reminder if unrelated request lands on dirty non-main branch | No |
| `fix-spiral-detector` | userPromptSubmit | UserPromptSubmit | reminder if ≥3 of last 5 commits are fixes | No |
| `branch-hygiene-check` | userPromptSubmit | UserPromptSubmit | reminder to prune merged / excess local branches | No |
| `changelog-maintenance` | beforeCommit | PostToolUse / Bash (`git commit`) | `additionalContext` changelog reminder | No |
| `comment-standards-check` | preToolUse/shell | PostToolUse / Bash (`git commit`) | `additionalContext` parser-breaking-comment check | No |
| `spec-validation-gate` | fileEdited `.kiro/specs/**` | PostToolUse / Write\|Edit | `additionalContext` spec-completeness check | No |
| `bug-doc-completion-check` | fileEdited `docs/bugs/BUG-*` | PostToolUse / Write\|Edit | `additionalContext` bug-doc-completeness check | No |

Helper scripts (local, gitignored): `.claude/hooks/on-commit-checks.sh`
(changelog + comment-standards, keyed on `git commit`) and
`.claude/hooks/spec-doc-checks.sh` (spec + bug-doc, keyed on edited file path).

### Rationale for the two non-obvious calls

1. **`beforeCommit`/`fileEdited` have no Claude Code equivalent.** Claude Code emits
   `PostToolUse` (not `beforeCommit`) and has no `fileEdited` event. So
   `changelog-maintenance` keys on a `PostToolUse`/Bash match of `git commit` (the
   reminder says "amend the commit if a gap is found"), and the two `fileEdited`
   hooks key on `PostToolUse`/`Write|Edit` inspecting `tool_input.file_path`.

2. **`additionalContext`, not `deny`, for the four `askAgent` hooks.** Kiro's
   `askAgent` asks the agent to *reason* (validate a spec, check comment safety) —
   work a static bash matcher cannot do without false positives. Delivering the same
   instruction as `additionalContext` preserves the advisory, agent-driven intent
   and keeps the happy path unblocked. The only **blocking** hook remains the
   shipped gate, whose decision (shell a runner vs. use the MCP tool) *is*
   mechanically decidable.

Every advisory hook is silent on the happy path (no "OK" spam into context) —
they emit only when there is something to say.

## Consequences

### Positive

- The repo now dogfoods the exact gate it ships to users; a shelled `npx vitest`
  here is denied just as it would be in a consumer repo.
- Discipline is enforced in Claude Code sessions, not just Kiro ones.
- The written justification (this ADR) + the hook mapping make the harness
  auditable and portable to future harnesses.

### Negative / Tradeoffs

- **Two sources of truth.** Kiro hooks and Claude Code hooks must now be kept in
  sync by hand; a new Kiro hook does not auto-appear in Claude Code. Mitigation:
  this ADR's mapping table is the sync checklist.
- **Local, not shipped.** Because `.claude/` is gitignored, a fresh clone does not
  get these hooks; a maintainer re-derives them from this ADR (or we later add a
  `tracepulse init --claude --dev` profile — see Risks).
- Five UserPromptSubmit hooks add ~150–200 ms of git calls per prompt. Acceptable.

### Risks

- **Drift between the two harnesses.** Mitigated by this ADR and by treating
  `tracepulse-gate.sh` (the one tracked, shipped hook) as the canonical gate both
  harnesses point at.
- **`additionalContext` support.** Relies on Claude Code injecting PreToolUse/
  PostToolUse `additionalContext`; if a client drops it, the reminder is simply not
  shown (fails safe, never blocks work).
- **Shipping the dev hooks.** If we later want consumers to get the advisory hooks
  too, that is a separate decision (extend `tracepulse init --claude`), tracked as a
  follow-up rather than smuggled in via the gitignored file.

## Links

- Ticket: TRP-71 (this work); TRP-39 (keep `.claude/` out of the public tree);
  TRP-23 (`tracepulse init --claude` installs the gate).
- Follow-ups: TRP-72 (surface Claude Code support in README/docs), TRP-73
  (telemetry to demonstrate savings).
- `docs/how-we-improve.md` — "The Friction Gradient Discovery".
- Shipped gate: `skills/claude-hooks/tracepulse-gate.sh`.
- Kiro side: `.kiro/hooks/*.kiro.hook`, `.kiro/steering/*.md`.
